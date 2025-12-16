import { useEffect, useRef, useState } from 'react';
import { checkPrivilege, checkPrivilegesBatch } from '../api.js';

export default function usePhotoPrivileges(photos) {
  const [privilegesMap, setPrivilegesMap] = useState({});
  const lastCheckedFilenamesRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    const loadPrivileges = async () => {
      if (!Array.isArray(photos) || photos.length === 0) {
        lastCheckedFilenamesRef.current = [];
        setPrivilegesMap({});
        return;
      }

      const filenames = photos.map((photo) => photo.filename);
      const prev = lastCheckedFilenamesRef.current;
      const unchanged =
        prev.length === filenames.length &&
        prev.every((filename, index) => filename === filenames[index]);

      if (unchanged) return;

      lastCheckedFilenamesRef.current = filenames;

      const initial = {};
      // Avoid user-visible "Loading..." labels in the UI; render blank until privileges resolve.
      for (const photo of photos) initial[photo.id] = '';
      setPrivilegesMap(initial);

      let map = {};
      let batchSucceeded = false;

      try {
        const batchResult = await checkPrivilegesBatch(filenames);
        if (batchResult && typeof batchResult === 'object') {
          for (const photo of photos) {
            const privilege = batchResult[photo.filename];
            if (typeof privilege === 'string') {
              map[photo.id] = privilege;
              continue;
            }

            if (privilege && typeof privilege === 'object') {
              const privArr = [];
              if (privilege.read || privilege.canRead) privArr.push('R');
              if (privilege.write || privilege.canWrite) privArr.push('W');
              if (privilege.execute || privilege.canExecute) privArr.push('X');
              map[photo.id] = privArr.length > 0 ? privArr.join('') : '?';
              continue;
            }

            map[photo.id] = '?';
          }

          batchSucceeded = true;
        }
      } catch (error) {
        console.warn('[usePhotoPrivileges] Batch privilege check failed, falling back to individual checks.', error);
      }

      if (!batchSucceeded) {
        map = {};
        for (const photo of photos) {
          try {
            const result = await checkPrivilege(photo.filename);
            const rawPrivileges =
              result?.privileges ||
              result?.privilege ||
              (result?.canRead || result?.canWrite || result?.canExecute ? result : null);

            if (rawPrivileges && rawPrivileges.read !== undefined) {
              rawPrivileges.canRead = rawPrivileges.read;
              rawPrivileges.canWrite = rawPrivileges.write;
              rawPrivileges.canExecute = rawPrivileges.execute;
            }

            if (rawPrivileges) {
              const privArr = [];
              if (rawPrivileges.canRead) privArr.push('R');
              if (rawPrivileges.canWrite) privArr.push('W');
              if (rawPrivileges.canExecute) privArr.push('X');
              map[photo.id] = privArr.length > 0 ? privArr.join('') : '?';
            } else {
              map[photo.id] = '?';
            }
          } catch (error) {
            console.warn('[usePhotoPrivileges] Privilege check failed', photo.filename, error);
            map[photo.id] = 'Err';
          }
        }
      }

      if (!cancelled) setPrivilegesMap(map);
    };

    loadPrivileges();

    return () => {
      cancelled = true;
    };
  }, [photos]);

  return privilegesMap;
}
