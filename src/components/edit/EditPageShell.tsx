import { ReactNode } from 'react';
import { editPageStyles } from './styles';

interface EditPageShellProps {
  children: ReactNode;
}

/**
 * EditPageShell - Outer fixed overlay container for EditPage
 * Provides the slate-300 background and main white card container
 */
export default function EditPageShell({ children }: EditPageShellProps) {
  return (
    <div 
      className="fixed inset-0 z-50 font-sans text-slate-900"
      style={editPageStyles.fixedOverlay}
    >
      {children}
    </div>
  );
}
