/**
 * Type declarations for File System Access API
 * https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
 */

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    kind: 'file';
    getFile(): Promise<File>;
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    kind: 'directory';
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }

  // HTML Input element capture attribute (for mobile camera)
  interface HTMLAttributes<T> {
    capture?: boolean | 'user' | 'environment';
  }
}

// Upload response type from API
export interface UploadResponse {
  metadata?: {
    compass_heading?: number;
  };
}

export {};
