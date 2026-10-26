"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { templateToArrayBuffer } from "../lib/parse/template";
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

/** The three buttons section 4.8 requires on every entry point into the app. */
export function DataLoader({
  size = "lg",
  onLoaded,
  extra,
}: {
  size?: "md" | "lg";
  onLoaded?: () => void;
  extra?: ReactNode;
}) {
  const router = useRouter();
  const { loadSample, loadFile, busy } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const go = () => (onLoaded ? onLoaded() : router.push("/dashboard"));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size={size}
        variant="primary"
        disabled={busy !== null}
        onClick={() => {
          loadSample();
          go();
        }}
      >
        Load sample data
      </Button>

      <Button size={size} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
        {busy ?? "Upload workbook"}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          // Reset first so re-picking the same file still fires a change event.
          e.target.value = "";
          if (!file) return;
          await loadFile(file);
          go();
        }}
      />

      <Button
        size={size}
        variant="ghost"
        onClick={() => download(templateToArrayBuffer(), "Launchpad_Blank_Template.xlsx")}
      >
        Download blank template
      </Button>

      {extra}
    </div>
  );
}
