/**
 * Rubikku design system. Import everything UI from here:
 *   import { Button, Card, MoveChip, Icon, useTheme, springs, sound, toast } from '../../ui'
 */
export { cx, type ClassValue } from './cx'

// Tokens in JS
export {
  CUBE_COLORS,
  CUBE_COLOR_LETTER,
  CUBE_COLOR_NAME,
  CUBE_CLASSES,
  TONE_CLASSES,
  FACE_COLOR,
  FACE_NAME,
  type CubeColor,
  type Face,
  type Tone,
} from './colors'

// Theme, motion, sound
export { useTheme, changeTheme, applyTheme, startThemeSync, resolveTheme, SCENE_THEME, THEME_COLOR, type ResolvedTheme, type ThemeChoice, type ThemeApi, type ThemeOrigin } from './theme'
export {
  springs,
  durations,
  easings,
  pageTransition,
  staggerContainer,
  staggerItem,
  fadeIn,
  popIn,
  dialogPanel,
  sheetPanel,
  scrim,
  pressable,
  useMotionPref,
  prefersReducedMotion,
  type MotionPref,
} from './motion'
export { MotionProvider } from './MotionProvider'
export { sound, initSound, SOUND_NAMES, type SoundName } from './sound'

// Icons
export { Icon, ICON_NAMES, isIconName, type IconName, type IconProps } from './icons'

// Notation helpers
export { parseMoveToken, describeMove, tokenizeMoves, type ParsedMove, type MoveKind, type MoveModifier, type SequenceToken } from './moves'

// Primitives
export { Button, ButtonLink, Spinner, buttonClasses, type ButtonProps, type ButtonLinkProps, type ButtonVariant, type ButtonSize } from './components/Button'
export { IconButton, type IconButtonProps, type IconButtonSize } from './components/IconButton'
export { Card, CardLink, cardClasses, type CardProps, type CardLinkProps, type CardVariant, type CardPadding } from './components/Card'
export { Badge, Chip, type BadgeProps, type ChipProps } from './components/Badge'
export { Sticker, type StickerProps, type StickerSize } from './components/Sticker'
export { ProgressBar, ProgressRing, type ProgressBarProps, type ProgressRingProps } from './components/Progress'
export { radioGroupKeyDown, Tabs, TabPanel, SegmentedControl, type TabsProps, type SegmentedControlProps, type OptionItem } from './components/Tabs'
export { Toggle, type ToggleProps } from './components/Toggle'
export { Slider, type SliderProps } from './components/Slider'
export { Modal, Sheet, type ModalProps } from './components/Modal'
export { Tooltip, type TooltipProps } from './components/Tooltip'
export { toast, Toaster, type ToastOptions } from './components/Toast'
export { Kbd } from './components/Kbd'
export { MoveChip, MoveSequence, type MoveChipProps, type MoveSequenceProps, type MoveChipSize, type MoveChipState } from './components/MoveChip'
export { CubeSwatch, type CubeSwatchProps, type CubeSwatchSize } from './components/CubeSwatch'
export { StatTile, type StatTileProps } from './components/StatTile'
export { EmptyState, type EmptyStateProps } from './components/EmptyState'
export { PlaybackBar, type PlaybackBarProps } from './components/PlaybackBar'
export { IsoCube, SCRAMBLED_FACES, type IsoCubeProps, type IsoFace } from './components/IsoCube'
export { CubeStage, type CubeStageProps } from './components/CubeStage'
export { FaceGrid, type FaceGridProps } from './components/FaceGrid'
export { FlagArt, type FlagArtProps, type FlagArtSpec, type FlagColor } from './components/FlagArt'
export { FLAG_PALETTE, type FlagPaletteName } from '../cube'
export { CubeNet, type CubeNetProps } from './components/CubeNet'
export { NET_CELLS, NET_FACE_LABEL, netNeighbor, netColors, netStickerLabel, type NetCell, type NetDirection } from './cubeNetLayout'
export { Logo, type LogoProps } from './components/Logo'
export { Page, PageHeader, Section, Reveal, Field, type PageProps, type PageHeaderProps, type SectionProps, type FieldProps } from './components/Page'
export { AnimatedNumber, type AnimatedNumberProps } from './components/AnimatedNumber'
export { HoldButton, type HoldButtonProps } from './components/HoldButton'
export { StageTracker, StageMarker, type StageTrackerProps, type StageTrackerItem, type StageTrackerState, type StageMarkerProps } from './components/StageTracker'
export { BadgeArt, badgeTier, type BadgeArtProps, type BadgeTier } from './components/BadgeArt'
export { CelebrationLayer, CelebrationSlot } from './components/CelebrationLayer'
export {
  celebration,
  useCelebrationCube,
  useCelebrations,
  mergeCelebrations,
  MERGE_MS,
  CELEBRATION_MS,
  type Celebration,
  type CelebrationTier,
  type CelebrationCube,
  type CelebrationAction,
  type MomentOptions,
  type MilestoneOptions,
} from './celebrate'
