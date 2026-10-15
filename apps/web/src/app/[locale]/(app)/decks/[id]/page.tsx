import { DeckDetail } from '@/components/decks/deck-detail';

// Decks live in the browser, so this page is a client shell that loads the deck by id.
export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeckDetail deckId={decodeURIComponent(id)} />;
}
