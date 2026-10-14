SELECT w.id, w.word, w.translation, cs.format_level
FROM card_states cs
JOIN words w ON w.id = cs.word_id
WHERE cs.user_id = $1 AND cs.state <> 'new' AND cs.due_at <= $2
ORDER BY (EXTRACT(EPOCH FROM ($2 - cs.last_review_at)) / 86400.0) / cs.stability DESC
LIMIT $3;
