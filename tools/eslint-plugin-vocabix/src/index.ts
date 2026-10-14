// Project rules that keep components on the design system and the i18n pipeline.
import type { ESLint, Rule } from 'eslint';
import type { Literal, Node, TemplateElement } from 'estree';
import { violationsIn, type Violation } from './class-tokens';

const MESSAGES: Record<Violation['kind'], string> = {
  dark: '"{{token}}": no dark: variants — a dark theme is just another token set.',
  'raw-color':
    '"{{token}}": raw color. Use semantic tokens (bg-surface, text-fg-muted, bg-accent…).',
  physical:
    '"{{token}}": physical direction. Use logical classes (ms-/me-/ps-/pe-/start-/end-/text-start).',
};

/**
 * Checks every string in component files, not only className attributes: variant maps and
 * cx() arguments are plain strings too. Class-like tokens are specific enough to avoid noise.
 */
const designTokens: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow raw colors, dark: variants and physical directions in classes' },
    messages: { violation: '{{message}}' },
    schema: [],
  },
  create(context) {
    const check = (node: Node, text: string) => {
      for (const v of violationsIn(text)) {
        context.report({
          node,
          messageId: 'violation',
          data: { message: MESSAGES[v.kind].replace('{{token}}', v.token) },
        });
      }
    };
    return {
      Literal(node: Literal & Rule.NodeParentExtension) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node: TemplateElement & Rule.NodeParentExtension) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

/** Attributes whose values are read by people (or screen readers) and must be translated. */
const TEXT_ATTRIBUTES = new Set([
  'alt',
  'title',
  'placeholder',
  'label',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-valuetext',
  'aria-roledescription',
]);
const HAS_LETTER = /\p{L}/u;

interface JSXTextNode {
  type: 'JSXText';
  value: string;
}
interface JSXAttributeNode {
  type: 'JSXAttribute';
  name: { type: string; name: string };
  value: { type: string; value?: unknown; expression?: { type: string; value?: unknown } } | null;
}

const noJsxLiterals: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow user-visible text literals in JSX; use next-intl messages' },
    messages: {
      text: 'Hard-coded text "{{text}}" in JSX. Move it to messages/<locale>/*.json.',
    },
    schema: [],
  },
  create(context) {
    const report = (node: unknown, text: string) =>
      context.report({
        node: node as Node,
        messageId: 'text',
        data: { text: text.trim().slice(0, 40) },
      });
    return {
      JSXText(node: JSXTextNode) {
        if (HAS_LETTER.test(node.value)) report(node, node.value);
      },
      JSXExpressionContainer(node: {
        expression: { type: string; value?: unknown };
        parent?: { type: string };
      }) {
        // {'text'} as a child; attribute values are handled below.
        if (node.parent?.type === 'JSXAttribute') return;
        const e = node.expression;
        if (e.type === 'Literal' && typeof e.value === 'string' && HAS_LETTER.test(e.value))
          report(node, e.value);
      },
      JSXAttribute(node: JSXAttributeNode) {
        if (!TEXT_ATTRIBUTES.has(node.name.name)) return;
        const v = node.value;
        const raw =
          v?.type === 'Literal'
            ? v.value
            : v?.type === 'JSXExpressionContainer' && v.expression?.type === 'Literal'
              ? v.expression.value
              : null;
        if (typeof raw === 'string' && HAS_LETTER.test(raw)) report(node, raw);
      },
    } as unknown as Rule.RuleListener; // ESTree typings have no JSX node types.
  },
};

const plugin: ESLint.Plugin = {
  meta: { name: 'eslint-plugin-vocabix' },
  rules: { 'design-tokens': designTokens, 'no-jsx-literals': noJsxLiterals },
};

export default plugin;
