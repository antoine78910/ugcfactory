"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type RecreateAnalyzeResponse } from "@/lib/recreateAnalysis";
import type { RecreateProjectAssets, RecreateSceneKeyframes } from "@/lib/recreateProjects";
import { RecreateSceneDashboard } from "./RecreateSceneDashboard";

type LogEntry = { id: string; message: string };

export type RecreateResultsPanelProps = {
  result: RecreateAnalyzeResponse | null;
  projectId: string | null;
  projectAssets: RecreateProjectAssets;
  projectKeyframes: Record<string, RecreateSceneKeyframes>;
  keyframeRunning: string | null;
  frameUploadBusy: string | null;
  globalUploadBusy: boolean;
  scriptDraft: string;
  scriptApproved: boolean;
  imageModelChoice: string;
  sceneModelChoice: Record<string, string>;
  scenePromptOverrides: Record<string, string>;
  logs: LogEntry[];
  onImageModelChange: (modelId: string) => void;
  pickValidStudioModelId: (raw: string | undefined) => string;
  formatSeconds: (value: number) => string;
  onScriptDraftChange: (value: string) => void;
  onScriptApprove: () => void;
  onSceneModelChange: (sceneId: string, modelId: string) => void;
  onScenePromptChange: (sceneId: string, prompt: string) => void;
  onUploadProjectAsset: (
    file: File,
    field: "productImageUrl" | "packagingImageUrl" | "logoImageUrl",
  ) => void;
  onUploadFrameProduct: (sceneId: string, role: "start" | "end", file: File) => void;
  onApplyDefaultProductToAllFrames: () => void;
  onGenerateKeyframe: (sceneId: string, role: "start" | "end", force: boolean) => void;
  onGenerateScene: (sceneId: string, force: boolean) => void;
  onGenerateAllKeyframes: () => void;
  onCopyText: (label: string, text: string) => void;
  onDownloadBriefPack: () => void;
};

export function RecreateResultsPanel(props: RecreateResultsPanelProps) {
  if (props.result) {
    return (
      <RecreateSceneDashboard
        result={props.result}
        projectId={props.projectId}
        projectAssets={props.projectAssets}
        projectKeyframes={props.projectKeyframes}
        keyframeRunning={props.keyframeRunning}
        frameUploadBusy={props.frameUploadBusy}
        globalUploadBusy={props.globalUploadBusy}
        scriptDraft={props.scriptDraft}
        scriptApproved={props.scriptApproved}
        imageModelChoice={props.imageModelChoice}
        sceneModelChoice={props.sceneModelChoice}
        scenePromptOverrides={props.scenePromptOverrides}
        logs={props.logs}
        pickValidStudioModelId={props.pickValidStudioModelId}
        formatSeconds={props.formatSeconds}
        onImageModelChange={props.onImageModelChange}
        onScriptDraftChange={props.onScriptDraftChange}
        onScriptApprove={props.onScriptApprove}
        onSceneModelChange={props.onSceneModelChange}
        onScenePromptChange={props.onScenePromptChange}
        onUploadProjectAsset={props.onUploadProjectAsset}
        onUploadFrameProduct={props.onUploadFrameProduct}
        onApplyDefaultProductToAllFrames={props.onApplyDefaultProductToAllFrames}
        onGenerateKeyframe={props.onGenerateKeyframe}
        onGenerateScene={props.onGenerateScene}
        onGenerateAllKeyframes={props.onGenerateAllKeyframes}
        onCopyText={props.onCopyText}
        onDownloadBriefPack={props.onDownloadBriefPack}
      />
    );
  }

  return (
    <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
      <CardHeader>
        <CardTitle>Logs</CardTitle>
        <CardDescription className="text-white/55">
          Run an analysis to open the scene board. Upload and pipeline steps appear here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs leading-6 text-white/80">
          {props.logs.length === 0 ? (
            <div className="text-white/40">No logs yet.</div>
          ) : (
            props.logs.map((entry) => <div key={entry.id}>{entry.message}</div>)
          )}
        </div>
      </CardContent>
    </Card>
  );
}
