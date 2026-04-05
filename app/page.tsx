import WorktimeTracker from "./components/WorktimeTracker";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-100 dark:bg-zinc-950">
      <WorktimeTracker />
    </div>
  );
}
