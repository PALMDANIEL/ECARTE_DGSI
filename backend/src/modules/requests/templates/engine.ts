import Handlebars from 'handlebars';

const hb = Handlebars.create();

hb.registerHelper('upper', (s: unknown) => (typeof s === 'string' ? s.toUpperCase() : ''));
hb.registerHelper('lines', function (this: unknown, n: unknown, options: Handlebars.HelperOptions) {
  // Répète le bloc n fois : espaces réservés aux visas et signatures (sauts de ligne vides)
  const count = Math.max(0, Math.min(40, Number(n) || 0));
  let out = '';
  for (let i = 0; i < count; i++) out += options.fn(this);
  return out;
});
hb.registerHelper('eq', (a: unknown, b: unknown) => a === b);

/** Compile un modèle de document ; l'échappement HTML est actif par défaut (les données ne peuvent pas injecter de balises). */
export function renderTemplate(html: string, context: unknown): string {
  return hb.compile(html, { strict: false })(context);
}
