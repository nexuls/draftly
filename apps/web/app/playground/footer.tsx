type Props = {
  counts: {
    words: number;
    lines: number;
    char: number;
  };
};

export default function Footer({ counts }: Props) {
  return (
    <footer className="h-10 w-full py-1 px-8 flex items-center justify-between gap-6 font-mono text-sm text-muted-foreground">
      <div />
      <div className="flex items-center gap-4">
        <span>Words: {counts.words}</span>
        <span>•</span>
        <span>Lines: {counts.lines}</span>
        <span>•</span>
        <span>Char: {counts.char}</span>
      </div>
    </footer>
  );
}
