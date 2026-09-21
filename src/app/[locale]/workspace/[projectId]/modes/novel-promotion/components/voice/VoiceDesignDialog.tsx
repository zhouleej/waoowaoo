'use client'

import VoiceDesignDialogBase, {
  type VoiceDesignMutationPayload,
  type VoiceDesignMutationResult,
} from '@/components/voice/VoiceDesignDialogBase'
import {
  useAnalyzeProjectCharacterVoicePrompt,
  useDesignProjectVoice,
} from '@/lib/query/hooks'

interface VoiceDesignDialogProps {
  isOpen: boolean
  speaker: string
  hasExistingVoice?: boolean
  onClose: () => void
  onSave: (voiceId: string, audioBase64: string) => void | Promise<void>
  projectId: string
  characterId: string
  initialVoicePrompt?: string
  onVoicePromptAnalyzed?: (voicePrompt: string) => void
}

export default function VoiceDesignDialog({
  isOpen,
  speaker,
  hasExistingVoice = false,
  onClose,
  onSave,
  projectId,
  characterId,
  initialVoicePrompt = '',
  onVoicePromptAnalyzed,
}: VoiceDesignDialogProps) {
  const designVoiceMutation = useDesignProjectVoice(projectId)
  const analyzeVoicePromptMutation = useAnalyzeProjectCharacterVoicePrompt(projectId)

  const handleDesignVoice = async (
    payload: VoiceDesignMutationPayload,
  ): Promise<VoiceDesignMutationResult> => {
    return await designVoiceMutation.mutateAsync(payload)
  }

  const handleAnalyzeVoicePrompt = async (): Promise<string> => {
    const result = await analyzeVoicePromptMutation.mutateAsync({ characterId })
    return result.voicePrompt
  }

  return (
    <VoiceDesignDialogBase
      isOpen={isOpen}
      speaker={speaker}
      hasExistingVoice={hasExistingVoice}
      onClose={onClose}
      onSave={onSave}
      onDesignVoice={handleDesignVoice}
      initialVoicePrompt={initialVoicePrompt}
      onAnalyzeVoicePrompt={handleAnalyzeVoicePrompt}
      onVoicePromptAnalyzed={onVoicePromptAnalyzed}
    />
  )
}
