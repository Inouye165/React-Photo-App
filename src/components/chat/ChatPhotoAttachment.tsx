import AuthenticatedImage from '../AuthenticatedImage'

import { API_BASE_URL } from '../../api'
import { toUrl } from '../../utils/toUrl'

export interface ChatPhotoAttachmentProps {
  roomId: string
  photoId: string
}

export default function ChatPhotoAttachment({ roomId, photoId }: ChatPhotoAttachmentProps) {
  const src = toUrl(`/display/chat-image/${roomId}/${photoId}`, API_BASE_URL)

  return (
    <div className="mt-2">
      <AuthenticatedImage
        src={src}
        alt="Shared photo"
        className="max-w-[240px] w-full rounded-xl border border-slate-200 overflow-hidden"
      />
    </div>
  )
}
