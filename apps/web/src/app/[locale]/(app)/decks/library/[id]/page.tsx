import { LibraryDeck } from '@/components/library/library-deck';

// Built-in decks are read in the browser together with the learner's copies of them.
export default async function LibraryDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LibraryDeck deckId={decodeURIComponent(id)} />;
}
