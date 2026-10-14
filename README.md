# Vocabix

Вебзастосунок для вивчення іншомовної лексики з інтервальним повторенням (FSRS-6 + рівні формату вправ).

> Статус: **фаза A, етап A2** — ядро, шар даних, дизайн-система, теми, i18n та адаптивна оболонка.
> Розділи «Повторення», «Колоди», «Рейтинг», «Профіль» поки що заглушки.

## Запуск

Потрібні Node.js ≥ 22 і pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm dev           # http://localhost:3000 → /uk
pnpm typecheck     # TypeScript у всіх пакетах
pnpm lint          # ESLint, зокрема власні правила дизайн-системи та i18n
pnpm test          # Vitest (ядро, дані, теми, переклади, правила лінтера)
pnpm build         # production-збірка Next.js
pnpm e2e           # Playwright: мобільний (390×844) і десктопний (1280×800) в'юпорти
pnpm screenshots   # скріншоти /dev/ui і сторінок у 5 в'юпортах × 5 тем → apps/web/screenshots
```

Перед першим `pnpm e2e`: `pnpm --filter @vocabix/web exec playwright install chromium`.

Сторінка `/uk/dev/ui` показує всі компоненти в усіх темах. Вона доступна в `pnpm dev`;
у production-збірці — лише з `NEXT_PUBLIC_ENABLE_DEV_UI=1`.

## Структура

```
apps/web                 Next.js (App Router), Tailwind CSS v4, next-intl, Radix UI
  messages/<locale>/     переклади інтерфейсу (ICU), один JSON на простір імен
  src/app/[locale]/      маршрути; (app)/ — сторінки в оболонці, dev/ui — галерея компонентів
  src/components/ui/     Button, Card, Dialog, Tabs, Switch, ProgressBar, Toast, Avatar, Badge, Tooltip
  src/components/shell/  нижня панель (телефон), бічна панель (md+), колонка прогресу (lg+)
  src/themes/            реєстр тем і токени кольорів
  src/i18n/              реєстр локалей, маршрутизація, завантаження повідомлень
packages/core            чисті функції: FSRS-6, XP, стопка, оцінювання відповіді, журнал подій,
                         інтерфейси репозиторіїв, Clock/Rng, параметри моделі (src/config)
packages/content         реєстр мов, що вивчаються, і мовні адаптери
packages/data            реалізації репозиторіїв: LocalStorageRepo (фаза A)
tools/eslint-plugin-vocabix  правила: design-tokens, no-jsx-literals
reference/               еталонні файли, з яких перенесено ядро
```

`core` не залежить від браузера чи Node: той самий код працюватиме на сервері у фазі B.

## Ключові рішення

- **Журнал подій — джерело істини.** Стан картки відтворюється з подій функцією `replayCard`;
  випадковий зсув інтервалу береться з `Rng`, засіяного `id` події, тож відтворення детерміноване.
- **Параметри моделі** (`w₀…w₂₀`, `ρ`, `τ⁰`, ліміти, пороги оцінювання, XP) — лише в
  `packages/core/src/config/params.ts`.
- **localStorage**: ключі `vocabix:v1:*`, `schemaVersion` з міграціями, компактний журнал,
  `StorageQuotaError` при переповненні, експорт/імпорт JSON з відкатом. UI звертається до даних
  лише через `useRepos()`; лінтер забороняє `localStorage` у компонентах.
- **Теми — набори семантичних токенів.** Стандартну палітру Tailwind вимкнено (`--color-*: initial`),
  тож `bg-white` чи `text-gray-900` не існують; правило `vocabix/design-tokens` додатково ловить
  сирі кольори, `dark:` і фізичні напрямки (`ml-`, `left-`, `text-right`). Тема застосовується
  inline-скриптом у `<head>` до гідратації — без «блимання».
- **Жодних рядків у JSX.** Правило `vocabix/no-jsx-literals` ловить текст і текстові атрибути
  (`aria-label`, `alt`, `placeholder`…). Тест перевіряє, що всі локалі мають однакові ключі й
  коректний ICU з тими самими аргументами.
- **Доступність.** Контраст токенів кожної теми (WCAG AA) перевіряє unit-тест; сторінки — axe у
  Playwright. Цілі натискання ≥ 44 px, логічні властивості для RTL.

## Як додати тему

1. Файл `apps/web/src/themes/<id>.ts` з усіма токенами з `COLOR_TOKENS` і полем `unlock`
   (`free` | `level:N` | `achievement:id` | `purchase:sku`).
2. Запис у масиві `THEMES` у `apps/web/src/themes/registry.ts`.
3. Назва теми — ключ `<id>` у `messages/<locale>/themes.json` для кожної локалі.

`pnpm test` перевірить контраст усіх пар токенів.

## Як додати мову інтерфейсу

1. Папка `apps/web/messages/<code>/` з тими самими JSON-файлами, що й `uk/`.
2. Запис у `LOCALES` у `apps/web/src/i18n/locales.ts` (`dir: 'rtl'` для арабської, івриту тощо;
   `script` обирає резервний стек шрифтів).

`pnpm test` перевірить, що ключі й аргументи збігаються з українською локаллю.

## Як додати мову, що вивчається

1. `packages/content/src/adapters/<code>.ts` — адаптер (`createBasicAdapter` з правилами нормалізації).
2. Один запис у `LANGUAGES` у `packages/content/src/languages.ts`.
