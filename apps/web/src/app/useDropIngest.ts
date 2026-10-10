import { type DragEvent, useState } from 'react';
import { filesFromDrop } from '../lib/ingest.ts';
import { ingestFiles } from '../state/commands/ingest.ts';

/** Only OS file/folder drags count; in-app drags (e.g. reordering) carry text only. */
const hasFiles = (dt: DataTransfer) => Array.from(dt.types).includes('Files');

/** Props that make an element take dropped files and folders, and whether files are dragged over it. */
export function useDropIngest() {
  const [dragOver, setDragOver] = useState(false);
  const props = {
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget === e.target) setDragOver(false);
    },
    onDrop: async (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      setDragOver(false);
      void ingestFiles(await filesFromDrop(e.dataTransfer));
    },
  };
  return { dragOver, props };
}
