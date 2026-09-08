// Editor
export interface EditorStatusResponse {
  connected: true;
  open_scenes: string[];
  is_playing: boolean;
}

// Scene
export interface TreeNode {
  name: string;
  type: string;
  path: string;
  children?: TreeNode[];
}

export interface SceneTreeResponse {
  scene_path: string;
  root: TreeNode;
}

export interface SelectedNodesResponse {
  selected: Array<{ name: string; type: string; path: string }>;
}

export interface AddNodeResponse {
  success: true;
  path: string;
}

export interface RemoveNodeResponse {
  success: true;
}

export interface ReparentNodeResponse {
  success: true;
  new_path: string;
}

export interface OpenSceneResponse {
  success: true;
}

export interface SaveSceneResponse {
  success: true;
}

// Inspector
export interface NodeProperty {
  name: string;
  type: string;
  value: string;
}

export interface GetPropertiesResponse {
  node: string;
  properties: NodeProperty[];
}

export interface SetPropertyResponse {
  success: true;
  property: string;
  value: string;
}

// Script
export interface CurrentScriptResponse {
  path: string;
  source: string;
  cursor_line: number;
  cursor_column: number;
}

export interface NoScriptResponse {
  script: null;
}

export interface OpenScriptsResponse {
  scripts: string[];
}

export interface SelectedCodeResponse {
  text: string;
}

export interface InsertAtCursorResponse {
  success: true;
}

// Run
export interface PlayResponse {
  success: true;
}

export interface StopResponse {
  success: true;
  output: string[];
}

export interface IsRunningResponse {
  running: boolean;
}

export interface GetOutputResponse {
  output: string[];
  total_lines?: number;
}

// Screenshot
export interface ScreenshotResponse {
  success: true;
  format: string;
  data: string;
  width: number;
  height: number;
}

// Node Operations
export interface RenameNodeResponse {
  success: true;
  old_name: string;
  new_name: string;
  new_path: string;
}

export interface DuplicateNodeResponse {
  success: true;
  path: string;
}

export interface MoveNodeResponse {
  success: true;
  new_index: number;
}

// Signal Management
export interface SignalArg {
  name: string;
  type: string;
}

export interface SignalInfo {
  name: string;
  args: SignalArg[];
}

export interface ListSignalsResponse {
  node: string;
  signals: SignalInfo[];
}

export interface ConnectSignalResponse {
  success: true;
}

export interface DisconnectSignalResponse {
  success: true;
}

export interface SignalConnection {
  signal: string;
  from: string;
  to: string;
  method: string;
  flags: number;
}

export interface ListConnectionsResponse {
  connections: SignalConnection[];
}

// Script Operations
export interface CreateScriptResponse {
  success: true;
  script_path: string;
}

export interface DetachScriptResponse {
  success: true;
}

export interface GetScriptForNodeResponse {
  script_path?: string;
  class_name?: string;
  script?: null;
}

// Animation
export interface AnimationInfo {
  name: string;
  length: number;
  track_count: number;
}

export interface ListAnimationsResponse {
  node: string;
  animations: AnimationInfo[];
}

export interface AnimationKeyframe {
  time: number;
  value: unknown;
}

export interface AnimationTrack {
  index: number;
  type: string;
  path: string;
  keys: AnimationKeyframe[];
}

export interface GetAnimationResponse {
  name: string;
  length: number;
  loop_mode: number;
  tracks: AnimationTrack[];
}

export interface CreateAnimationResponse {
  success: true;
  animation_name: string;
  track_count: number;
}

// File & Resource Management
export interface ImportAssetResponse {
  success: true;
  paths: string[];
}

export interface ReadResourceResponse {
  type: string;
  path: string;
  properties: Array<{ name: string; value: unknown }>;
}

export interface WriteResourceResponse {
  success: true;
}

// Debug
export interface SetBreakpointResponse { success: true; file: string; line: number; }
export interface RemoveBreakpointResponse { success: true; }
export interface ListBreakpointsResponse { breakpoints: Array<{ file: string; line: number }>; }
export interface StackFrame { file: string; line: number; function: string; id: number; }
export interface GetStackTraceResponse { frames: StackFrame[]; }
export interface LocalVariable {
  name: string;
  value: unknown;
  /** "Locals", "Members" or "Globals" when read from the debugger inspector. */
  scope?: string;
}
export interface GetLocalsResponse { locals: LocalVariable[]; }
export interface DebugStepResponse { success: true; }
export interface DebugContinueResponse { success: true; }

// Common error shape (returned as result, not a JSON-RPC error)
export interface BridgeErrorResponse {
  error: string;
}

// Profiler
export interface ProfilerFrame { [key: string]: unknown; }
export interface StartProfilerResponse { success: true; }
export interface StopProfilerResponse { success: true; frames: ProfilerFrame[]; }
export interface GetProfilerDataResponse { frames: ProfilerFrame[]; }
