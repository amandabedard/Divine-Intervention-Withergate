import { useEffect } from 'react';
import { MapCanvas } from './canvas';
import { AssetPanel, PropertiesPanel, TopBar } from './panels';
import { editor, useEditor } from './state';

export function App() {
  const st = useEditor();

  useEffect(() => {
    void editor.load();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.matches('input,textarea,select');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void editor.save();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (typing) return;
        e.preventDefault();
        editor.redo();
        return;
      }
      if (typing) return;
      switch (e.key) {
        case 'v': case 'V': editor.set({ tool: 'select' }); break;
        case 'b': case 'B': editor.set({ tool: 'place' }); break;
        case 'e': case 'E': editor.set({ tool: 'erase' }); break;
        case 'c': case 'C': editor.set({ tool: 'collision' }); break;
        case 'n': case 'N': editor.set({ tool: 'entity' }); break;
        case 'g': case 'G': editor.set({ snap: !editor.state.snap }); break;
        case 'Escape': editor.select(null); editor.set({ tool: 'select' }); break;
        case 'Delete': case 'Backspace': editor.deleteSelection(); break;
        // arrows nudge the selection; with nothing selected they scroll the view
        case 'ArrowLeft': if (editor.state.selection) editor.nudge(e.shiftKey ? -10 : -1, 0); else editor.panBy(e.shiftKey ? -400 : -80, 0); e.preventDefault(); break;
        case 'ArrowRight': if (editor.state.selection) editor.nudge(e.shiftKey ? 10 : 1, 0); else editor.panBy(e.shiftKey ? 400 : 80, 0); e.preventDefault(); break;
        case 'ArrowUp': if (editor.state.selection) editor.nudge(0, e.shiftKey ? -10 : -1); else editor.panBy(0, e.shiftKey ? -400 : -80); e.preventDefault(); break;
        case 'ArrowDown': if (editor.state.selection) editor.nudge(0, e.shiftKey ? 10 : 1); else editor.panBy(0, e.shiftKey ? 400 : 80); e.preventDefault(); break;
        case 'Home': editor.fitMap(); e.preventDefault(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (editor.state.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  if (!st.ready) return <div className="loading">Loading editor… {st.status}</div>;
  return (
    <div className="layout">
      <TopBar />
      <AssetPanel />
      <MapCanvas />
      <PropertiesPanel />
    </div>
  );
}
