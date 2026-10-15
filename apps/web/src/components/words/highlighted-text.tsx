import { highlightTerm } from '@vocabx/core';

/** An example sentence with the studied word (any of its forms) underlined in the accent colour. */
export function HighlightedText({
  text,
  term,
  lang,
}: {
  text: string;
  term: string;
  lang: string;
}) {
  return (
    <>
      {highlightTerm(text, term, lang).map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="rounded-sm bg-accent/12 px-0.5 font-semibold text-accent underline decoration-accent/60 decoration-2 underline-offset-4"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
