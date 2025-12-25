/**
 * Type declarations for File System Access API
 * https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
 */

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    __E2E_MODE__?: boolean;
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

}

declare module 'react' {
  // HTML Input element capture attribute (for mobile camera)
  // Module augmentation makes sure this affects React's types rather than creating
  // a new global interface that React would not use.
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
