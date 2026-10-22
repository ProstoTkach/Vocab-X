import { LibraryDeck } from '@/components/library/library-deck';

// Built-in decks are read in the browser together with the learner's copies of them.
export default async function LibraryDeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pick?: string }>;
}) {
  const [{ id }, { pick }] = await Promise.all([params, searchParams]);
  // ?pick=1 (from "Continue picking" in the library) opens the card picker right away.
  return <LibraryDeck deckId={decodeURIComponent(id)} startPicking={pick === '1'} />;
}
