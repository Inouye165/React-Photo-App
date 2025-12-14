import { ReactNode } from 'react';
import styles from './EditPageShell.module.css';

interface EditPageShellProps {
  children: ReactNode;
}

/**
 * EditPageShell - Outer fixed overlay container for EditPage
 * Provides the slate-300 background and main white card container
 * Phase 5: Styles migrated to CSS Modules
 */
export default function EditPageShell({ children }: EditPageShellProps) {
  return (
    <div className={styles.fixedOverlay}>
      {children}
    </div>
  );
}
