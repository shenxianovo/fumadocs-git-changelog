import Link from 'next/link';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm text-fd-muted-foreground">A community integration for Fumadocs</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Every page has a history.
      </h1>
      <p className="max-w-xl text-lg text-fd-muted-foreground">
        Show who contributed and what changed. Add contributors and a Git timeline to your
        documentation with one compiler plugin.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/docs" className={buttonVariants({ variant: 'primary' })}>
          Get started
        </Link>
        <Link href="/docs/demo" className={buttonVariants({ variant: 'secondary' })}>
          Try the demo
        </Link>
      </div>
      <p className="text-sm text-fd-muted-foreground">
        MDX and Sätteri · Light and dark themes · Optional GitHub profiles
      </p>
    </main>
  );
}
