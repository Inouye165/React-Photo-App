import LocationMapPanel from '../LocationMapPanel';
import { editPageStyles } from './styles';
import type { Photo } from '../../types/photo';

interface LocationTabPanelProps {
  photo: Photo;
}

/**
 * LocationTabPanel - Location tab content for EditPage
 * Wraps the LocationMapPanel component
 */
export default function LocationTabPanel({ photo }: LocationTabPanelProps) {
  return (
    <div 
      className="flex-1 bg-slate-50 p-4" 
      style={editPageStyles.locationTabContainer}
    >
      <div style={editPageStyles.locationMapWrapper}>
        <LocationMapPanel photo={photo} />
      </div>
    </div>
  );
}
