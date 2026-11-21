// The single resume renderer. It draws through primitives `P`
// ({ Page, View, Text, Link, Svg, Path }) so the same tree becomes HTML for
// the live preview and react-pdf nodes for the downloaded PDF.
import { Fragment } from 'react';
import { contactItems } from './blocks';
import { fontFamilyName } from './fonts';
import { applyCase, color, columnOrder, columnPadBottom, columnPadTop, paletteFor } from './theme';

// `builtin:Helvetica` etc. name a standard PDF font (used only by the PDF safety fallback).
const F = (key) => (String(key).startsWith('builtin:') ? String(key).slice(8) : fontFamilyName(key));
const lineBox = (theme, size) => (size || theme.size.base) * theme.size.lineHeight;
// Line heights are always absolute points. react-pdf resolves a unitless
// lineHeight against the declaring style's own font size (18pt if none) and
// then inherits the absolute value, while CSS inherits the ratio; absolute
// values behave the same in both. Any text that sets its own size sets its own line.
const pt = (value) => `${Number(value.toFixed(3))}pt`;
const type = (theme, size, ratio = theme.size.lineHeight) => ({ fontSize: size, lineHeight: pt(size * ratio) });
// Both engines collapse runs of spaces and several font subsets lack special
// space glyphs, so separators are their own items spaced with margins.
const sepParts = (separator) => {
  const value = String(separator || ' | ');
  return { mark: value.trim() || '|', gap: Math.max(2.5, (value.match(/^ */)[0].length || 1) * 2.4) };
};

/** Items in a wrapping row, joined by a separator that stays with the item before it. */
function InlineList({ P, items, separator = '  ·  ', textStyle = {}, sepColor, justify = 'flex-start', marginTop = 0 }) {
  const { mark, gap } = sepParts(separator);
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <P.View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: justify, marginTop }}>
      {list.map((node, index) => (
        <P.View key={index} style={{ flexDirection: 'row', flexShrink: 1, maxWidth: '100%' }}>
          <P.Text style={{ ...textStyle, flexShrink: 1 }}>{node}</P.Text>
          {index < list.length - 1 ? <P.Text style={{ ...textStyle, flexShrink: 0, marginHorizontal: gap, ...(sepColor ? { color: sepColor } : {}) }}>{mark}</P.Text> : null}
        </P.View>
      ))}
    </P.View>
  );
}

// ───────────── inline formatting (**bold**, *italic*, __underline__) ─────────────
// A plain function (not a component) so its strings are visible children for
// the PDF line-break pass.
export function richText(P, text) {
  return String(text || '').split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <P.Text key={index} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</P.Text>;
    if (part.startsWith('__') && part.endsWith('__') && part.length > 4) return <P.Text key={index} style={{ textDecoration: 'underline' }}>{part.slice(2, -2)}</P.Text>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <P.Text key={index} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</P.Text>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

// ───────────── contact icons (simple strokes, 24×24 grid) ─────────────
// Drawn with curves, never closed straight-edged boxes: PDF parsers read
// stroked rectangles as table rules and ATS checks then report a table.
const ICON_PATHS = {
  location: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', 'M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z'],
  email: ['M6 5.5c-1.6 0-2.5 1-2.5 2.6v7.8c0 1.6.9 2.6 2.5 2.6h12c1.6 0 2.5-1 2.5-2.6V8.1c0-1.6-.9-2.6-2.5-2.6C14 5.4 10 5.4 6 5.5z', 'M4 7.2c2.6 2.2 5.2 4.6 8 5.8 2.8-1.2 5.4-3.6 8-5.8'],
  mobile: ['M9 2.6c-1.7 0-2.6.9-2.6 2.6v13.6c0 1.7.9 2.6 2.6 2.6h6c1.7 0 2.6-.9 2.6-2.6V5.2c0-1.7-.9-2.6-2.6-2.6C13 2.5 11 2.5 9 2.6z', 'M11 18.2c.7.2 1.3.2 2 0'],
  linkedin: ['M7 3.6c-2.2 0-3.4 1.2-3.4 3.4v10c0 2.2 1.2 3.4 3.4 3.4h10c2.2 0 3.4-1.2 3.4-3.4V7c0-2.2-1.2-3.4-3.4-3.4C13.7 3.5 10.3 3.5 7 3.6z', 'M8.2 10.6c-.1 1.8-.1 3.6 0 5.4', 'M8.2 7.7a.2.2 0 1 0 .01 0', 'M11.6 16c-.1-1.8-.1-3.6 0-5.4', 'M11.6 13.2c0-1.6 1-2.6 2.4-2.6s2.4 1 2.4 2.6c0 1 0 1.9-.1 2.8'],
  github: ['M8.5 7.5c-1.6 1.4-3.1 2.9-4.5 4.5 1.4 1.6 2.9 3.1 4.5 4.5', 'M15.5 7.5c1.6 1.4 3.1 2.9 4.5 4.5-1.4 1.6-2.9 3.1-4.5 4.5'],
  portfolio: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M3.4 11.2c5.7-.9 11.5-.9 17.2 0', 'M12 3c2.8 2.6 2.8 15.4 0 18', 'M12 3c-2.8 2.6-2.8 15.4 0 18'],
};

function ContactIcon({ P, kind, size, tint }) {
  return (
    <P.Svg width={size} height={size} viewBox="0 0 24 24">
      {(ICON_PATHS[kind] || ICON_PATHS.portfolio).map((d) => <P.Path key={d} d={d} stroke={tint} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
    </P.Svg>
  );
}

// ───────────── header ─────────────
function headerTones(theme, where) {
  const h = theme.header;
  if (where === 'banner') {
    const literal = (ref, fallback) => (String(ref || '').startsWith('#') ? ref : fallback);
    return {
      name: literal(h.nameColor, h.bannerText),
      headline: literal(h.headlineColor, h.bannerMuted),
      contact: h.bannerMuted,
      icon: literal(h.iconColor, h.bannerMuted),
      rule: h.bannerMuted,
    };
  }
  const palette = paletteFor(theme, where === 'side' ? 'side' : 'main');
  return {
    name: color(palette, h.nameColor),
    headline: color(palette, h.headlineColor),
    contact: color(palette, h.contactColor),
    icon: color(palette, h.iconColor),
    rule: color(palette, h.ruleColor),
  };
}

function Contacts({ P, theme, items, tones, mode, align }) {
  const h = theme.header;
  const size = h.contactSize;
  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  const link = (item) => (item.href
    ? <P.Link src={item.href} style={{ color: tones.contact, textDecoration: h.linkUnderline && item.key !== 'mobile' ? 'underline' : 'none' }}>{item.value}</P.Link>
    : item.value);
  if (!items.length) return null;
  if (mode === 'labeled') {
    return items.map((item) => (
      <P.Text key={item.key} style={{ ...type(theme, size), color: tones.contact, textAlign }}>
        {item.label ? <P.Text style={{ fontWeight: 700 }}>{item.label}: </P.Text> : null}{link(item)}
      </P.Text>
    ));
  }
  if (mode === 'icons' || mode === 'stacked-icons') {
    const stacked = mode === 'stacked-icons';
    return (
      <P.View style={{ flexDirection: stacked ? 'column' : 'row', flexWrap: stacked ? 'nowrap' : 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', alignItems: stacked ? (align === 'right' ? 'flex-end' : 'flex-start') : 'center', columnGap: 11, rowGap: stacked ? 2.6 : 3, marginTop: stacked ? 0 : 5 }}>
        {items.map((item) => (
          <P.View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '100%' }}>
            <ContactIcon P={P} kind={item.key} size={size + 1} tint={tones.icon} />
            <P.Text style={{ ...type(theme, size), color: tones.contact, marginLeft: 3.5, flexShrink: 1 }}>{link(item)}</P.Text>
          </P.View>
        ))}
      </P.View>
    );
  }
  if (mode === 'stacked') {
    return items.map((item) => <P.Text key={item.key} style={{ ...type(theme, size), color: tones.contact, textAlign, marginTop: 1.6 }}>{link(item)}</P.Text>);
  }
  return (
    <InlineList P={P} items={items.map(link)} separator={h.separator} textStyle={{ ...type(theme, size), color: tones.contact }} justify={align === 'center' ? 'center' : 'flex-start'} marginTop={4} />
  );
}

function HeaderRule({ P, theme, tones }) {
  const { rule } = theme.header;
  if (rule === 'thin') return <P.View style={{ marginTop: 7, borderBottomWidth: 0.7, borderBottomColor: tones.rule }} />;
  if (rule === 'thick') return <P.View style={{ marginTop: 7, borderBottomWidth: 2, borderBottomColor: tones.rule }} />;
  if (rule === 'double') return <P.View style={{ marginTop: 7, height: 3.2, borderTopWidth: 0.8, borderBottomWidth: 0.8, borderTopColor: tones.rule, borderBottomColor: tones.rule }} />;
  return null;
}

export function ResumeHeader({ P, resume, theme, where = 'main' }) {
  const h = theme.header;
  const tones = headerTones(theme, where);
  const items = contactItems(resume);
  const basics = resume.basics || {};
  const align = where === 'side' ? 'left' : h.align;
  const textAlign = align === 'center' ? 'center' : 'left';
  const name = String(basics.name || '').trim();
  const headline = String(basics.headline || '').trim();
  const nameNode = name ? (
    <P.Text style={{ fontFamily: F(h.nameFont === 'body' ? theme.fonts.body : theme.fonts.heading), ...type(theme, h.nameSize, h.nameLineHeight), fontWeight: h.nameWeight, letterSpacing: h.nameSpacing, color: tones.name, textAlign }}>
      {applyCase(name, h.nameCase)}
    </P.Text>
  ) : null;
  const headlineNode = headline ? (
    <P.Text style={{ marginTop: 2.5, ...type(theme, h.headlineSize), fontWeight: h.headlineWeight, fontStyle: h.headlineItalic ? 'italic' : 'normal', letterSpacing: h.headlineSpacing, color: tones.headline, textAlign }}>
      {applyCase(headline, h.headlineCase)}
    </P.Text>
  ) : null;
  const contactMode = where === 'side' ? (h.contact === 'stacked' ? 'stacked' : 'stacked-icons') : h.contact;

  if (align === 'split' && where !== 'side') {
    const stackedMode = contactMode === 'stacked-icons' || contactMode === 'icons' ? 'stacked-icons' : 'stacked';
    return (
      <P.View style={{ paddingBottom: h.gapAfter }}>
        <P.View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <P.View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 12 }}>{nameNode}{headlineNode}</P.View>
          {items.length ? <P.View style={{ flexShrink: 0, maxWidth: '46%', alignItems: 'flex-end' }}><Contacts P={P} theme={theme} items={items} tones={tones} mode={stackedMode} align="right" /></P.View> : null}
        </P.View>
        <HeaderRule P={P} theme={theme} tones={tones} />
      </P.View>
    );
  }
  return (
    <P.View style={{ paddingBottom: h.gapAfter }}>
      {nameNode}
      {headlineNode}
      {items.length ? <P.View style={{ marginTop: where === 'side' ? 10 : contactMode === 'labeled' ? 1 : 0 }}><Contacts P={P} theme={theme} items={items} tones={tones} mode={contactMode} align={align} /></P.View> : null}
      <HeaderRule P={P} theme={theme} tones={tones} />
    </P.View>
  );
}

// ───────────── section titles ─────────────
export function SectionTitle({ P, theme, column, title }) {
  const t = column === 'side' ? theme.side.title : theme.title;
  const palette = paletteFor(theme, column);
  const textColor = color(palette, t.color);
  const ruleColor = color(palette, t.rule);
  const label = `${t.prefix || ''}${applyCase(title, t.case)}`;
  const textStyle = { fontFamily: F(theme.fonts.title), ...type(theme, t.size, 1.2), fontWeight: t.weight, letterSpacing: t.spacing, color: textColor, fontStyle: t.italic ? 'italic' : 'normal' };
  const text = (extra = {}) => <P.Text style={{ ...textStyle, ...extra }}>{label}</P.Text>;
  switch (t.variant) {
    case 'bar':
      return <P.View style={{ backgroundColor: color(palette, 'titleBg'), paddingVertical: 1.9, paddingHorizontal: 3.75 }}>{text()}</P.View>;
    case 'line-after':
      return (
        <P.View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <P.View style={{ flexShrink: 1, maxWidth: '85%' }}>{text()}</P.View>
          <P.View style={{ flexGrow: 1, flexShrink: 1, marginLeft: 7, borderBottomWidth: t.ruleWidth, borderBottomColor: ruleColor }} />
        </P.View>
      );
    case 'left-bar':
      return (
        <P.View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          <P.View style={{ width: 3.2, backgroundColor: color(palette, 'accent'), marginRight: 6, borderRadius: 1 }} />
          {text({ flexGrow: 1, flexShrink: 1 })}
        </P.View>
      );
    case 'center-rule':
      return (
        <P.View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <P.View style={{ flexGrow: 1, flexShrink: 1, borderBottomWidth: t.ruleWidth, borderBottomColor: ruleColor }} />
          {text({ flexShrink: 0, marginHorizontal: 9, textAlign: 'center' })}
          <P.View style={{ flexGrow: 1, flexShrink: 1, borderBottomWidth: t.ruleWidth, borderBottomColor: ruleColor }} />
        </P.View>
      );
    case 'short-underline':
      return (
        <P.View>
          {text()}
          <P.View style={{ width: 24, height: Math.max(1.6, t.ruleWidth * 2.2), marginTop: 2.6, backgroundColor: ruleColor }} />
        </P.View>
      );
    case 'pill':
      return (
        <P.View style={{ flexDirection: 'row' }}>
          <P.View style={{ backgroundColor: color(palette, 'accent'), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2.2 }}>{text({ color: '#ffffff' })}</P.View>
        </P.View>
      );
    case 'double-rule':
      return <P.View style={{ borderTopWidth: t.ruleWidth, borderBottomWidth: t.ruleWidth, borderTopColor: ruleColor, borderBottomColor: ruleColor, paddingVertical: 2.2 }}>{text()}</P.View>;
    case 'overline':
      return <P.View style={{ borderTopWidth: t.ruleWidth, borderTopColor: ruleColor, paddingTop: 3.2 }}>{text()}</P.View>;
    case 'boxed':
      return (
        <P.View style={{ flexDirection: 'row' }}>
          <P.View style={{ borderWidth: 0.9, borderColor: ruleColor, paddingHorizontal: 6.5, paddingVertical: 1.8 }}>{text()}</P.View>
        </P.View>
      );
    case 'center':
      return <P.View style={{ borderBottomWidth: t.ruleWidth, borderBottomColor: ruleColor, paddingBottom: 2.2 }}>{text({ textAlign: 'center' })}</P.View>;
    case 'underline':
      return <P.View style={{ borderBottomWidth: t.ruleWidth, borderBottomColor: ruleColor, paddingBottom: 1.8 }}>{text()}</P.View>;
    default: // plain, prompt
      return text();
  }
}

// ───────────── entries ─────────────
const linkStyle = (palette) => ({ color: color(palette, 'link'), textDecoration: 'none' });

function TwoSided({ P, left, right, rightStyle, gap = 10 }) {
  return (
    <P.View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <P.View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>{left}</P.View>
      {right ? <P.View style={{ flexShrink: 0, marginLeft: gap, maxWidth: '42%', alignItems: 'flex-end' }}><P.Text style={{ textAlign: 'right', ...rightStyle }}>{right}</P.Text></P.View> : null}
    </P.View>
  );
}

function EntryHead({ P, theme, block, railDate }) {
  const e = theme.entry;
  const { entry, custom, column } = block;
  const palette = paletteFor(theme, column);
  const titleText = entry.title ? (entry.link ? <P.Link src={entry.link} style={linkStyle(palette)}>{entry.title}</P.Link> : entry.title) : null;
  const techInline = e.tech === 'inline' && entry.technologies && !custom;
  const titleStyle = { fontWeight: e.titleWeight, color: color(palette, e.titleColor), fontSize: e.titleSize || theme.size.base };
  const dateStyle = { color: color(palette, e.dateColor), fontStyle: e.dateItalic ? 'italic' : 'normal', fontWeight: e.dateWeight };
  const locationStyle = { color: color(palette, e.locationColor), fontStyle: e.locationItalic ? 'italic' : 'normal' };
  const subtitleStyle = { fontStyle: e.subtitleItalic ? 'italic' : 'normal', color: color(palette, e.subtitleColor), fontWeight: e.subtitleWeight };
  const techLine = entry.technologies ? (custom
    ? <P.Text style={{ marginTop: 1.2 }}>{richText(P, entry.technologies)}</P.Text>
    : e.tech === 'line' ? <P.Text style={{ marginTop: 0.8 }}><P.Text style={{ fontWeight: 700 }}>{e.techLabel}</P.Text><P.Text style={{ fontStyle: 'italic' }}>{entry.technologies}</P.Text></P.Text>
      : e.tech === 'muted' ? <P.Text style={{ marginTop: 0.8, ...type(theme, theme.size.small), color: color(palette, 'muted') }}>{entry.technologies}</P.Text>
        : null) : null;
  const titleLine = (titleText || techInline) ? (
    <P.Text>
      {titleText ? <P.Text style={titleStyle}>{titleText}</P.Text> : null}
      {techInline ? <P.Text style={{ fontStyle: 'italic', color: color(palette, 'muted') }}>{titleText ? ' | ' : ''}{entry.technologies}</P.Text> : null}
    </P.Text>
  ) : null;
  const date = railDate ? '' : entry.date;

  if (column === 'side') {
    return (
      <P.View>
        {titleLine}
        {entry.subtitle ? <P.Text style={{ ...subtitleStyle, color: color(palette, 'muted') }}>{entry.subtitle}</P.Text> : null}
        <InlineList P={P} items={[entry.date, entry.location]} textStyle={{ ...type(theme, theme.size.small), color: color(palette, 'muted') }} />
        {!custom && entry.technologies && e.tech !== 'inline' ? <P.Text style={{ ...type(theme, theme.size.small), color: color(palette, 'muted') }}>{entry.technologies}</P.Text> : techLine}
      </P.View>
    );
  }
  if (e.variant === 'date-below') {
    return (
      <P.View>
        {titleLine}
        <InlineList
          P={P}
          separator="   ·   "
          marginTop={0.6}
          sepColor={color(palette, 'muted')}
          textStyle={type(theme, theme.size.small + 0.4)}
          items={[
            entry.subtitle ? <P.Text style={subtitleStyle}>{entry.subtitle}</P.Text> : null,
            entry.location ? <P.Text style={locationStyle}>{entry.location}</P.Text> : null,
            date ? <P.Text style={dateStyle}>{date}</P.Text> : null,
          ]}
        />
        {techLine}
      </P.View>
    );
  }
  if (e.variant === 'harvard') {
    return (
      <P.View>
        {(titleLine || entry.location) ? <TwoSided P={P} left={titleLine} right={entry.location} rightStyle={locationStyle} /> : null}
        {(entry.subtitle || date) ? <TwoSided P={P} left={entry.subtitle ? <P.Text style={subtitleStyle}>{entry.subtitle}</P.Text> : null} right={date} rightStyle={dateStyle} /> : null}
        {techLine}
      </P.View>
    );
  }
  return (
    <P.View>
      {(titleLine || date) ? <TwoSided P={P} left={titleLine} right={date} rightStyle={dateStyle} /> : null}
      {(entry.subtitle || entry.location) ? <TwoSided P={P} left={entry.subtitle ? <P.Text style={subtitleStyle}>{entry.subtitle}</P.Text> : null} right={entry.location} rightStyle={locationStyle} /> : null}
      {techLine}
    </P.View>
  );
}

function BulletMarker({ P, theme, column }) {
  const b = theme.bullet;
  const palette = paletteFor(theme, column);
  const tint = color(palette, b.markerColor);
  const size = theme.size.base;
  const top = (lineBox(theme) - 3.4) / 2;
  if (b.kind === 'dash' || b.kind === 'chevron') {
    return <P.Text style={{ color: tint, fontWeight: 700, ...type(theme, size) }}>{b.kind === 'dash' ? '–' : '›'}</P.Text>;
  }
  const shape = b.kind === 'circle'
    ? { width: 3.6, height: 3.6, borderRadius: 1.8, borderWidth: 0.6, borderColor: tint }
    : b.kind === 'square'
      ? { width: 3.2, height: 3.2, backgroundColor: tint }
      : { width: 3.4, height: 3.4, borderRadius: 1.7, backgroundColor: tint };
  return <P.View style={{ marginTop: top, ...shape }} />;
}

function Bullet({ P, theme, block }) {
  const b = theme.bullet;
  const side = block.column === 'side';
  return (
    <P.View style={{ flexDirection: 'row', paddingLeft: side ? 0 : b.leftPad }}>
      <P.View style={{ width: side ? 9 : b.indent, flexShrink: 0 }}><BulletMarker P={P} theme={theme} column={block.column} /></P.View>
      <P.Text style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>{richText(P, block.text)}</P.Text>
    </P.View>
  );
}

// ───────────── education ─────────────
const TABLE_COLUMNS = [['year', '14%', 'Year'], ['degree', '34%', 'Degree'], ['institute', '34%', 'Institute'], ['score', '18%', 'CGPA/Percentage']];

function EducationHead({ P, theme }) {
  return (
    <P.View style={{ flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: color(theme.colors, 'rule'), paddingHorizontal: 3.75, paddingVertical: 0.4 }}>
      {TABLE_COLUMNS.map(([key, width, label]) => <P.View key={key} style={{ width, paddingRight: 4 }}><P.Text style={{ fontWeight: 700, ...type(theme, theme.size.base, 1.12) }}>{label}</P.Text></P.View>)}
    </P.View>
  );
}

function Education({ P, theme, block, railDate }) {
  const { entry, variant, column } = block;
  const e = theme.entry;
  const palette = paletteFor(theme, column);
  const muted = color(palette, 'muted');
  if (variant === 'table') {
    return (
      <P.View style={{ flexDirection: 'row', paddingHorizontal: 3.75, paddingVertical: 0.4, borderBottomWidth: block.last ? 0.6 : 0, borderBottomColor: color(palette, 'rule') }}>
        {TABLE_COLUMNS.map(([key, width]) => <P.View key={key} style={{ width, paddingRight: 4 }}><P.Text style={type(theme, theme.size.base, 1.12)}>{entry[key]}</P.Text></P.View>)}
      </P.View>
    );
  }
  if (variant === 'compact') {
    return (
      <P.View>
        {entry.degree ? <P.Text style={{ fontWeight: 700 }}>{entry.degree}</P.Text> : null}
        {entry.institute ? <P.Text>{entry.institute}</P.Text> : null}
        <InlineList P={P} items={[entry.year, entry.score]} textStyle={{ ...type(theme, theme.size.small), color: muted }} />
      </P.View>
    );
  }
  const year = railDate ? '' : entry.year;
  const dateStyle = { color: color(palette, e.dateColor), fontStyle: e.dateItalic ? 'italic' : 'normal', fontWeight: e.dateWeight };
  if (variant === 'entry') {
    if (e.variant === 'date-below') {
      return (
        <P.View>
          {entry.degree ? <P.Text style={{ fontWeight: 700 }}>{entry.degree}</P.Text> : null}
          <InlineList P={P} separator="   ·   " marginTop={0.6} items={[entry.institute, entry.score, year]} textStyle={{ ...type(theme, theme.size.small + 0.4), color: muted }} />
        </P.View>
      );
    }
    return (
      <P.View>
        {(entry.degree || year) ? <TwoSided P={P} left={entry.degree ? <P.Text style={{ fontWeight: 700 }}>{entry.degree}</P.Text> : null} right={year} rightStyle={dateStyle} /> : null}
        {(entry.institute || entry.score) ? <TwoSided P={P} left={entry.institute ? <P.Text style={{ fontStyle: 'italic' }}>{entry.institute}</P.Text> : null} right={entry.score} rightStyle={{ color: muted }} /> : null}
      </P.View>
    );
  }
  // stacked: institute + score, then degree + year
  return (
    <P.View>
      {(entry.institute || entry.score) ? <TwoSided P={P} left={entry.institute ? <P.Text style={{ fontWeight: 700 }}>{entry.institute}</P.Text> : null} right={entry.score} rightStyle={{}} /> : null}
      {(entry.degree || year) ? <TwoSided P={P} left={entry.degree ? <P.Text style={{ fontStyle: 'italic' }}>{entry.degree}</P.Text> : null} right={year} rightStyle={dateStyle} /> : null}
    </P.View>
  );
}

// ───────────── skills ─────────────
/** "AWS (EC2, S3), Git" -> ["AWS (EC2, S3)", "Git"]: separators inside brackets do not split. */
export function splitSkills(value) {
  const items = [];
  let depth = 0;
  let current = '';
  for (const char of String(value || '')) {
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    if (depth === 0 && ',;|'.includes(char)) { items.push(current); current = ''; } else current += char;
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean);
}

function Skill({ P, theme, block }) {
  const { entry, variant, column } = block;
  const palette = paletteFor(theme, column);
  const category = String(entry.category || '').trim();
  const skills = String(entry.skills || '').trim();
  if (variant === 'tags') {
    const tags = splitSkills(skills);
    return (
      <P.View>
        {category ? <P.Text style={{ fontWeight: 700, marginBottom: 2.4, ...type(theme, column === 'side' ? theme.size.small + 0.4 : theme.size.base) }}>{category}</P.Text> : null}
        <P.View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 3.6, rowGap: 3.4 }}>
          {tags.map((tag, index) => (
            <P.View key={`${tag}-${index}`} style={{ backgroundColor: color(palette, 'chipBg'), borderRadius: 2.6, paddingHorizontal: 4.6, paddingVertical: 1.3 }}>
              <P.Text style={{ ...type(theme, theme.size.small, 1.2), color: color(palette, 'chipText') }}>{tag}</P.Text>
            </P.View>
          ))}
        </P.View>
      </P.View>
    );
  }
  if (variant === 'stack') {
    return (
      <P.View>
        {category ? <P.Text style={{ fontWeight: 700 }}>{category}</P.Text> : null}
        {skills ? <P.Text style={{ ...type(theme, theme.size.small + 0.3), color: color(palette, 'muted') }}>{skills}</P.Text> : null}
      </P.View>
    );
  }
  if (variant === 'table') {
    return (
      <P.View style={{ flexDirection: 'row' }}>
        <P.Text style={{ width: 108, flexShrink: 0, paddingRight: 8, fontWeight: 700 }}>{category}</P.Text>
        <P.Text style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>{skills}</P.Text>
      </P.View>
    );
  }
  const content = <>{category ? <P.Text style={{ fontWeight: 700 }}>{category}{skills ? ': ' : ''}</P.Text> : null}{skills}</>;
  if (variant === 'bullets') {
    return (
      <P.View style={{ flexDirection: 'row' }}>
        <P.View style={{ width: 8, flexShrink: 0 }}><P.View style={{ marginTop: (lineBox(theme) - 3.2) / 2, width: 3.2, height: 3.2, borderRadius: 1.6, backgroundColor: color(palette, 'text') }} /></P.View>
        <P.Text style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>{content}</P.Text>
      </P.View>
    );
  }
  // No flexBasis 0 here: in a column, Yoga would size the text to zero height.
  return <P.Text>{content}</P.Text>;
}

function CompactItem({ P, theme, block }) {
  const { entry, column } = block;
  const palette = paletteFor(theme, column);
  const supporting = [entry.subtitle, entry.location, entry.technologies].filter(Boolean).join(' – ');
  const bullets = (entry.bullets || []).map((bullet) => String(bullet?.text ?? bullet ?? '')).filter((text) => text.trim());
  const title = entry.link ? <P.Link src={entry.link} style={linkStyle(palette)}>{entry.title}</P.Link> : entry.title;
  const body = (
    <P.Text>
      {entry.title ? <P.Text style={{ fontWeight: 700 }}>{title}</P.Text> : null}
      {supporting ? <>{entry.title ? ' – ' : ''}{richText(P, supporting)}</> : null}
      {bullets.map((text, index) => <Fragment key={index}>{' – '}{richText(P, text)}</Fragment>)}
    </P.Text>
  );
  if (column === 'side') {
    return (
      <P.View>
        {body}
        {entry.date ? <P.Text style={{ ...type(theme, theme.size.small), color: color(palette, 'muted') }}>{entry.date}</P.Text> : null}
      </P.View>
    );
  }
  return (
    <P.View style={{ flexDirection: 'row' }}>
      <P.View style={{ width: 9, flexShrink: 0 }}><P.View style={{ marginTop: (lineBox(theme) - 3.2) / 2, width: 3.2, height: 3.2, borderRadius: 1.6, backgroundColor: color(palette, theme.bullet.markerColor) }} /></P.View>
      <P.View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
        <TwoSided P={P} left={body} right={entry.date} rightStyle={{ color: color(palette, theme.entry.dateColor) }} />
      </P.View>
    </P.View>
  );
}

// ───────────── block spacing + left rail ─────────────
function blockSpacing(theme, block) {
  if (block.firstInColumn) return 0;
  const t = block.column === 'side' ? theme.side.title : theme.title;
  if (block.kind === 'title') return t.gapBefore;
  if (block.kind === 'header') return 0;
  if (block.firstInSection) return block.railLabel ? t.gapBefore : t.gapAfter;
  switch (block.kind) {
    case 'entry': return block.column === 'side' ? Math.max(4, theme.entry.gap - 1) : theme.entry.gap;
    case 'bullet': return theme.bullet.gap;
    case 'edu': return block.variant === 'table' ? 0 : Math.max(3, theme.entry.gap - 2);
    case 'eduHead': return 0;
    case 'skill': return block.variant === 'tags' ? 5 : block.variant === 'stack' ? 4 : 2;
    case 'compact': return 1.6;
    default: return 2;
  }
}

function BlockContent({ P, resume, theme, block, railDate }) {
  switch (block.kind) {
    case 'header': return <ResumeHeader P={P} resume={resume} theme={theme} where={block.column} />;
    case 'title': return <SectionTitle P={P} theme={theme} column={block.column} title={block.title} />;
    case 'entry': return <EntryHead P={P} theme={theme} block={block} railDate={railDate} />;
    case 'bullet': return <Bullet P={P} theme={theme} block={block} />;
    case 'eduHead': return <EducationHead P={P} theme={theme} />;
    case 'edu': return <Education P={P} theme={theme} block={block} railDate={railDate} />;
    case 'skill': return <Skill P={P} theme={theme} block={block} />;
    case 'compact': return <CompactItem P={P} theme={theme} block={block} />;
    default: return null;
  }
}

function RailCell({ P, theme, block, spacing }) {
  const rail = theme.rail;
  const palette = paletteFor(theme, 'main');
  if (rail.kind === 'label') {
    const t = theme.title;
    return (
      <P.View style={{ width: rail.width, flexShrink: 0, paddingTop: spacing, paddingRight: 10 }}>
        {block.railLabel ? <P.Text style={{ fontFamily: F(theme.fonts.title), fontSize: t.size, lineHeight: pt(lineBox(theme)), fontWeight: t.weight, letterSpacing: t.spacing, color: color(palette, t.color) }}>{`${t.prefix || ''}${applyCase(block.railLabel, t.case)}`}</P.Text> : null}
      </P.View>
    );
  }
  if (rail.kind === 'date') {
    const value = block.kind === 'entry' ? block.entry.date : block.kind === 'edu' ? block.entry.year : '';
    const e = theme.entry;
    return (
      <P.View style={{ width: rail.width, flexShrink: 0, paddingTop: spacing, paddingRight: 8 }}>
        {value ? <P.Text style={{ color: color(palette, e.dateColor), fontStyle: e.dateItalic ? 'italic' : 'normal', ...type(theme, theme.size.small + 0.4) }}>{value}</P.Text> : null}
      </P.View>
    );
  }
  // timeline: a continuous line with a dot on each entry
  const dot = block.kind === 'entry' || block.kind === 'edu';
  const dotSize = 7;
  return (
    <P.View style={{ width: rail.width, flexShrink: 0, position: 'relative' }}>
      <P.View style={{ position: 'absolute', left: 3.4, top: 0, bottom: 0, width: 1.2, backgroundColor: color(palette, 'rule') }} />
      {dot ? <P.View style={{ position: 'absolute', left: 0.5, top: spacing + (lineBox(theme) - dotSize) / 2, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color(palette, 'accent'), borderWidth: 1.4, borderColor: '#ffffff' }} /> : null}
    </P.View>
  );
}

export function ResumeBlock({ P, resume, theme, block }) {
  const spacing = blockSpacing(theme, block);
  const railed = theme.rail && block.column === 'main' && !['header', 'title'].includes(block.kind);
  const railDate = railed && theme.rail.kind === 'date';
  if (!railed) {
    return <P.View data-b={block.id} style={{ paddingTop: spacing }}><BlockContent P={P} resume={resume} theme={theme} block={block} /></P.View>;
  }
  return (
    <P.View data-b={block.id} style={{ flexDirection: 'row' }}>
      <RailCell P={P} theme={theme} block={block} spacing={spacing} />
      <P.View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingTop: spacing }}><BlockContent P={P} resume={resume} theme={theme} block={block} railDate={railDate} /></P.View>
    </P.View>
  );
}

// ───────────── pages ─────────────
function columnStyle(theme, column, pageIndex) {
  const base = { paddingTop: columnPadTop(theme, column, pageIndex), paddingBottom: columnPadBottom(theme, column) };
  if (column === 'side') {
    const { side } = theme;
    return { ...base, width: side.width, flexShrink: 0, backgroundColor: side.bg, color: side.text, paddingLeft: side.padH, paddingRight: side.padH };
  }
  return { ...base, flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingLeft: theme.page.padH, paddingRight: theme.page.padH };
}

export function ResumePageBody({ P, resume: rawResume, theme, layout, page, pageIndex, measure = false }) {
  const resume = layout.resume || rawResume;
  const byId = new Map([...layout.columns.main, ...layout.columns.side].map((block) => [block.id, block]));
  const pageStyle = {
    backgroundColor: theme.colors.page,
    fontFamily: F(theme.fonts.body),
    ...type(theme, theme.size.base),
    // No ligatures: some subset ligature glyphs (JetBrains Mono "//") crash the
    // PDF engine, and plain letters keep ATS text extraction exact ("fi", not "ﬁ").
    fontFeatureSettings: { liga: false, calt: false, clig: false, dlig: false },
    color: theme.colors.text,
    flexDirection: 'column',
  };
  const bannerPad = theme.side ? theme.side.padH : theme.page.padH;
  return (
    <P.Page style={pageStyle} measure={measure}>
      {theme.stripe ? <P.View style={{ height: theme.stripe.height, backgroundColor: color(theme.colors, theme.stripe.color) }} /> : null}
      {pageIndex === 0 && layout.banner ? (
        <P.View data-banner="1" style={{ backgroundColor: color(theme.colors, theme.header.bannerBg), paddingHorizontal: bannerPad, paddingVertical: theme.header.bannerPadV }}>
          <ResumeHeader P={P} resume={resume} theme={theme} where="banner" />
        </P.View>
      ) : null}
      <P.View style={{ flexDirection: 'row', flexGrow: 1, alignItems: 'stretch' }}>
        {columnOrder(theme).map((column) => (
          <P.View key={column} data-col={column} style={columnStyle(theme, column, pageIndex)}>
            {(page[column] || []).map((id) => byId.get(id)).filter(Boolean).map((block) => <ResumeBlock key={block.id} P={P} resume={resume} theme={theme} block={block} />)}
          </P.View>
        ))}
      </P.View>
    </P.Page>
  );
}
