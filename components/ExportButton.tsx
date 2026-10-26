"use client";

import { useState } from "react";
import { exportFileName, exportToArrayBuffer, type ExportInput } from "../lib/export/workbook";
import { logEntry } from "../lib/state/health";
import { useStore } from "../lib/state/store";
import { Button } from "./ui/primitives";

function download(bytes: ArrayBuffer, fileName: string) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const { result, policy, versions, overrides, datasetLabel, log } = useStore();
  const [failed, setFailed] = useState<string | null>(null);

  if (!result) return null;

  const onClick = () => {
    const input: ExportInput = {
      result,
      policy,
      versions,
      overrides,
      datasetLabel,
      generatedAt: new Date().toISOString(),
    };
    try {
      const name = exportFileName(input);
      download(exportToArrayBuffer(input), name);
      setFailed(null);
      log(logEntry("export", true, `Exported ${result.applicants.length} decisions`, name));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setFailed(detail);
      log(logEntry("export", false, "Export failed", detail));
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size={size} variant="primary" onClick={onClick}>
        Export decisions
      </Button>
      {failed ? (
        <span className="text-xs text-rose-700">
          The file could not be written. Nothing on screen changed. {failed}
        </span>
      ) : null}
    </div>
  );
}
