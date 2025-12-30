import { useEffect, useRef, useState } from 'react';
import { checkPrivilege, checkPrivilegesBatch } from '../api';

export default function usePhotoPrivileges(photos) {
  const [privilegesMap, setPrivilegesMap] = useState(new Map());
  const lastCheckedFilenamesRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    const loadPrivileges = async () => {
      if (!Array.isArray(photos) || photos.length === 0) {
        lastCheckedFilenamesRef.current = [];
        setPrivilegesMap(new Map());
        return;
      }

      const filenames = photos.map((photo) => photo.filename);
      const prev = lastCheckedFilenamesRef.current;
      const unchanged =
        prev.length === filenames.length &&
        prev.every((filename, index) => filename === filenames[index]);

      if (unchanged) return;

      lastCheckedFilenamesRef.current = filenames;

      const initial = new Map();
      // Avoid user-visible "Loading..." labels in the UI; render blank until privileges resolve.
      for (const photo of photos) initial.set(photo.id, '');
      setPrivilegesMap(initial);

      let map = new Map();
      let batchSucceeded = false;

      try {
        const batchResult = await checkPrivilegesBatch(filenames);
        if (batchResult instanceof Map) {
          for (const photo of photos) {
            const privilege = batchResult.get(photo.filename);
            if (typeof privilege === 'string') {
              map.set(photo.id, privilege);
              continue;
            }

            if (privilege && typeof privilege === 'object') {
              const privArr = [];
              if (privilege.read || privilege.canRead) privArr.push('R');
              if (privilege.write || privilege.canWrite) privArr.push('W');
              if (privilege.execute || privilege.canExecute) privArr.push('X');
              map.set(photo.id, privArr.length > 0 ? privArr.join('') : '?');
              continue;
            }

            map.set(photo.id, '?');
          }

          batchSucceeded = true;
        }
      } catch (error) {
        console.warn('[usePhotoPrivileges] Batch privilege check failed, falling back to individual checks.', error);
      }

      if (!batchSucceeded) {
        map = new Map();
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
              map.set(photo.id, privArr.length > 0 ? privArr.join('') : '?');
            } else {
              map.set(photo.id, '?');
            }
          } catch (error) {
            console.warn('[usePhotoPrivileges] Privilege check failed', photo.filename, error);
            map.set(photo.id, 'Err');
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
