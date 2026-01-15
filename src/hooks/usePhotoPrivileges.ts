import { useEffect, useRef, useState } from 'react';
import { checkPrivilege, checkPrivilegesBatch } from '../api';

type PhotoId = string | number;

export type PhotoPrivilegePhoto = {
  id: PhotoId;
  filename: string;
};

type PrivilegeFlags = {
  read?: boolean;
  write?: boolean;
  execute?: boolean;
  canRead?: boolean;
  canWrite?: boolean;
  canExecute?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toPrivilegeLabel(flags: PrivilegeFlags | null): string {
  if (!flags) return '?';
  const privArr: string[] = [];
  if (flags.read || flags.canRead) privArr.push('R');
  if (flags.write || flags.canWrite) privArr.push('W');
  if (flags.execute || flags.canExecute) privArr.push('X');
  return privArr.length > 0 ? privArr.join('') : '?';
}

function extractPrivilegeFlags(result: unknown): PrivilegeFlags | null {
  if (!isRecord(result)) return null;

  const nested =
    result.privileges ??
    result.privilege ??
    ((result.canRead || result.canWrite || result.canExecute) ? result : null);

  if (!isRecord(nested)) return null;

  const read = nested.read;
  const write = nested.write;
  const execute = nested.execute;

  const canRead = nested.canRead;
  const canWrite = nested.canWrite;
  const canExecute = nested.canExecute;

  return {
    canRead: typeof canRead === 'boolean' ? canRead : typeof read === 'boolean' ? read : undefined,
    canWrite: typeof canWrite === 'boolean' ? canWrite : typeof write === 'boolean' ? write : undefined,
    canExecute: typeof canExecute === 'boolean' ? canExecute : typeof execute === 'boolean' ? execute : undefined
  };
}

export default function usePhotoPrivileges(
  photos: PhotoPrivilegePhoto[] | null | undefined
): Map<PhotoId, string> {
  const [privilegesMap, setPrivilegesMap] = useState<Map<PhotoId, string>>(new Map());
  const lastCheckedFilenamesRef = useRef<string[]>([]);

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

      const initial = new Map<PhotoId, string>();
      for (const photo of photos) initial.set(photo.id, '');
      setPrivilegesMap(initial);

      let map = new Map<PhotoId, string>();
      let batchSucceeded = false;

      try {
        const batchResult: unknown = await checkPrivilegesBatch(filenames);
        if (batchResult instanceof Map) {
          for (const photo of photos) {
            const privilege = batchResult.get(photo.filename) as unknown;

            if (typeof privilege === 'string') {
              map.set(photo.id, privilege);
              continue;
            }

            if (isRecord(privilege)) {
              map.set(
                photo.id,
                toPrivilegeLabel({
                  read: typeof privilege.read === 'boolean' ? privilege.read : undefined,
                  write: typeof privilege.write === 'boolean' ? privilege.write : undefined,
                  execute: typeof privilege.execute === 'boolean' ? privilege.execute : undefined,
                  canRead: typeof privilege.canRead === 'boolean' ? privilege.canRead : undefined,
                  canWrite: typeof privilege.canWrite === 'boolean' ? privilege.canWrite : undefined,
                  canExecute: typeof privilege.canExecute === 'boolean' ? privilege.canExecute : undefined
                })
              );
              continue;
            }

            map.set(photo.id, '?');
          }

          batchSucceeded = true;
        }
      } catch (error) {
        console.warn(
          '[usePhotoPrivileges] Batch privilege check failed, falling back to individual checks.',
          error
        );
      }

      if (!batchSucceeded) {
        map = new Map<PhotoId, string>();
        for (const photo of photos) {
          try {
            const result: unknown = await checkPrivilege(photo.filename);
            const flags = extractPrivilegeFlags(result);
            map.set(photo.id, toPrivilegeLabel(flags));
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
