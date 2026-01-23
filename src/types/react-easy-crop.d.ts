declare module 'react-easy-crop' {
  import * as React from 'react'

  export type Area = { x: number; y: number; width: number; height: number }

  const Cropper: React.ComponentType<any>
  export default Cropper
}
