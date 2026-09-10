import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { VideoComposition } from './VideoComposition'
import { calculateTimelineDuration } from '../utils/time-utils'

const Root = () => <Composition
  id="Episode"
  component={VideoComposition}
  defaultProps={{ clips: [], bgmTrack: [], config: { fps: 30, width: 1920, height: 1080 } }}
  durationInFrames={1} fps={30} width={1920} height={1080}
  calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, calculateTimelineDuration(props.clips)), ...props.config })}
/>

registerRoot(Root)
