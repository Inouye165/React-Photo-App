const express = require('express');
const path = require('path');
const fs = require('fs');

module.exports = function createPrivilegeRouter(paths) {
  const { WORKING_DIR, INPROGRESS_DIR } = paths;
  const router = express.Router();

  router.post('/privilege', (req, res) => {
    try {
      if (typeof req.body === 'string') return res.status(400).json({ success: false, error: 'Invalid JSON body' });
      const { relPath, filenames } = req.body || {};

      // Check if batch request
      if (filenames && Array.isArray(filenames)) {
        const results = {};
        for (const filename of filenames) {
          try {
            // Normalize and try working dir first
            let absPath = path.resolve(WORKING_DIR, filename);
            if (!absPath.startsWith(WORKING_DIR)) {
              absPath = path.resolve(WORKING_DIR, filename);
            }

            if (!fs.existsSync(absPath)) {
              const alt = path.resolve(INPROGRESS_DIR, filename);
              if (fs.existsSync(alt)) absPath = alt;
            }

            if (!fs.existsSync(absPath)) {
              results[filename] = 'Not Found';
              continue;
            }

            const privileges = { read: false, write: false, execute: false };
            try { fs.accessSync(absPath, fs.constants.R_OK); privileges.read = true; } catch { /* ignore */ }
            try { fs.accessSync(absPath, fs.constants.W_OK); privileges.write = true; } catch { /* ignore */ }
            try { fs.accessSync(absPath, fs.constants.X_OK); privileges.execute = true; } catch { /* ignore */ }

            const privArr = [];
            if (privileges.read) privArr.push('R');
            if (privileges.write) privArr.push('W');
            if (privileges.execute) privArr.push('X');
            results[filename] = privArr.length > 0 ? privArr.join('') : '?';
          } catch {
            results[filename] = 'Err';
          }
        }
        return res.json({ success: true, privileges: results });
      }

      // Single file request (backward compatibility)
      if (!relPath) return res.status(400).json({ success: false, error: 'Missing relPath' });

      // Normalize and try working dir first
      let absPath = path.resolve(WORKING_DIR, relPath);
      if (!absPath.startsWith(WORKING_DIR)) {
        // allow fall-through to inprogress
        absPath = path.resolve(WORKING_DIR, relPath);
      }

      if (!fs.existsSync(absPath)) {
        const alt = path.resolve(INPROGRESS_DIR, relPath);
        if (fs.existsSync(alt)) absPath = alt;
      }

      if (!fs.existsSync(absPath)) return res.status(404).json({ success: false, error: 'File/folder not found' });

      const privileges = { read: false, write: false, execute: false };
      const log = [];
      try { fs.accessSync(absPath, fs.constants.R_OK); privileges.read = true; log.push('read: OK'); } catch { log.push('read: FAIL'); }
      try { fs.accessSync(absPath, fs.constants.W_OK); privileges.write = true; log.push('write: OK'); } catch { log.push('write: FAIL'); }
      try { fs.accessSync(absPath, fs.constants.X_OK); privileges.execute = true; log.push('execute: OK'); } catch { log.push('execute: FAIL'); }

      let stat = null;
      try { stat = fs.statSync(absPath); } catch {}

      return res.json({ success: true, absPath, privileges, log, stat: stat ? { isFile: stat.isFile(), isDirectory: stat.isDirectory(), mode: stat.mode, size: stat.size, mtime: stat.mtime } : null });
    } catch (err) {
      console.error('Privilege check error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  });

  return router;
};