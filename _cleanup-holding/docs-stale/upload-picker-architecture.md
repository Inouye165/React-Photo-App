# Upload Picker Command/Event Architecture

## Goals
- Single source of truth for the local upload picker workflow
- Explicit commands (+ events) to prevent ad-hoc state toggling
- Room for future features: background uploads, retries, multi-folder queues

## State Model
```
status: 'closed' | 'idle' | 'selecting' | 'uploading' | 'complete' | 'error'
selectedDirHandle: FileSystemDirectoryHandle | null
localPhotos: Array<{ id, name, file, exifDate, handle }>
filteredPhotos: derived from localPhotos + filters
filters: { startDate: string, endDate: string }
uploadQueue: Array<{ id, file, status: 'pending' | 'uploading' | 'success' | 'error', error?: string }>
metrics: { totalSelected, uploadedCount, failedCount }
error: string | null
```

## Commands
- `openPicker(dirHandle, files)`
- `closePicker(reason?)`
- `resetPicker()`
- `setFilters({ startDate, endDate })`
- `queuePhotos(fileList)`
- `startUpload({ ids })`
- `markUploadSuccess(id)`
- `markUploadFailure(id, error)`
- `finishUploads()`

Commands update state synchronously and emit events when needed (initial version: use console/event bus if necessary). Side effects (e.g., actual upload requests) live in thunk-like helpers triggered by commands.

## Flow Examples
### Folder Selected
1. `handleSelectFolder` -> read directory -> `openPicker(dirHandle, files)`
2. UI renders `status === 'idle'` with default selected = all files.

### Close Modal
1. UI dispatches `closePicker('user-dismissed')`
2. Store sets `status = 'closed'`, clears queue/localPhotos, resets filters.
3. Future: emit event for analytics.

### Upload
1. UI dispatches `startUpload({ ids })`
2. Store sets `status = 'uploading'`, marks queue items as `uploading`.
3. Async helper uploads each item; on resolve: `markUploadSuccess/Failure`.
4. When all done: `finishUploads()` -> `status = 'complete'`, clears or leaves summary.

## Integration Plan
1. Implement `uploadPickerSlice` with initial commands.
2. Update `useLocalPhotoPicker` to call commands instead of local state.
3. Update `PhotoUploadForm` to read state via selectors (e.g., `usePickerState` hook).
4. Adjust tests to mock commands.

## Future Extensions
- Persist `uploadQueue` to IndexedDB for background continuity.
- Add event bus to communicate with notification system.
- Support multiple directories by storing `selectedDirId` per queue entry.
