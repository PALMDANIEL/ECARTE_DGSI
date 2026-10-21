/**
 * Modèles de documents par défaut (HTML + CSS), fidèles aux formulaires officiels fournis :
 *  - DECISION_CONGE    : demande de décision de congé administratif (au Ministre, s/c voie hiérarchique)
 *  - JOUISSANCE_CONGE  : demande de jouissance de congé administratif (au chef de service)
 *  - AUTORISATION_ABSENCE : demande d'autorisation d'absence (en-tête administratif complet)
 *
 * Variables disponibles (contexte) : voir docs/module-demandes/PHASE-2.md. Les modèles sont modifiables
 * depuis l'administration (nouvelle version à chaque enregistrement, les anciens documents ne changent pas).
 */

const STEPS_BLOCK = `
{{#each steps}}
<div class="frame">
  <p class="frame-title">{{heading}}</p>
  {{#if done}}
    <p class="frame-result {{resultClass}}">{{resultLabel}}</p>
    {{#if comment}}<p class="frame-comment">{{comment}}</p>{{/if}}
    {{#if decisionNumber}}<p class="frame-comment">Décision N° {{decisionNumber}}</p>{{/if}}
    <p class="esign">Signé électroniquement par {{actorName}}{{#if actorTitle}}, {{actorTitle}}{{/if}}, le {{decidedAt}}<br>Empreinte : {{hash}}</p>
  {{else}}
    <div class="space {{#if isDecision}}space-decision{{/if}}"></div>
  {{/if}}
</div>
{{/each}}`;

const FOOTER_REF = `<div class="doc-ref">Référence {{reference}} — version {{version}}</div>`;

const CSS_ARIAL = `
body { font-family: Arial, Helvetica, sans-serif; font-size: 14pt; line-height: 1.12; color: #000; margin: 0; }
p { margin: 0 0 9pt 0; }
table { border-collapse: collapse; width: 100%; }
td { vertical-align: top; padding: 0; }
.head td.l { width: 55%; } .head td.r { width: 45%; text-align: center; }
.head td.r p, .head td.l p { margin: 0; }
.b { font-weight: bold; } .u { text-decoration: underline; } .ind { margin-left: 0; }
.objet { margin: 14pt 0 14pt 1.25cm; }
.body p { text-align: justify; text-indent: 1.25cm; }
.center { text-align: center; }
.agent-sign { margin-top: 10pt; text-align: right; }
.esign { font-size: 8.5pt; color: #333; margin: 4pt 0 0 0; font-family: Arial, sans-serif; }
.frame { margin-top: 18pt; page-break-inside: avoid; break-inside: avoid; }
.frame-title { font-weight: bold; text-decoration: underline; margin-bottom: 4pt; }
.frame-result { font-weight: bold; margin: 2pt 0 2pt 0; }
.frame-comment { margin: 0 0 2pt 0; }
.space { height: 2.6cm; } .space-decision { height: 4.2cm; }
.doc-ref { display: none; }
`;

export const DEFAULT_TEMPLATES: Record<string, { html: string; css: string }> = {
  DECISION_CONGE: {
    css: CSS_ARIAL,
    html: `<table class="head"><tr>
<td class="l"><p><b>{{agent.fullName}}</b></p><p>Matricule : {{agent.matricule}}</p><p>{{agent.grade}}</p><p>{{agent.structure}}</p></td>
<td class="r"><p><b>BURKINA FASO</b></p><p>------</p><p>La Patrie ou la Mort, Nous Vaincrons</p></td></tr>
<tr><td></td><td class="r" style="padding-top:14pt"><p>{{place}}, le {{dateShort}}</p></td></tr></table>
<p class="b" style="margin-top:14pt">A</p>
<p class="b">{{recipient.title}}</p>
<p class="b" style="padding-left:2.5cm"><u>{{recipient.city}}</u></p>
<p>s/c voie hiérarchique</p>
<p class="objet"><b><u>Objet</u> :</b> Demande de décision de congé administratif</p>
<p style="margin-left:1.25cm">{{recipient.greeting}},</p>
<div class="body">
<p>J’ai l’honneur de solliciter auprès de votre haute bienveillance, l’obtention d’une décision de congé administratif au titre de l’année {{fields.year}} pour en jouir {{fields.destinations}}.</p>
{{#if previousDecision}}<p>Ci-joint à ma demande une copie de ma dernière décision de congé N°{{previousDecision.number}} du {{previousDecision.date}}.</p>{{/if}}
<p>Veuillez agréer, {{recipient.greeting}}, l’expression de ma plus haute considération.</p>
</div>
<p class="agent-sign">{{agent.fullName}}<br><span class="esign">Demande déposée le {{dateShort}} après identification par la carte n° {{agent.cardNumber}}</span></p>
<p class="b">E-timbre N° : {{eStampNumber}}</p>
${STEPS_BLOCK}
${FOOTER_REF}`
  },

  JOUISSANCE_CONGE: {
    css: CSS_ARIAL,
    html: `<table class="head"><tr>
<td class="l"><p><b>{{agent.fullName}}</b></p><p>Matricule : {{agent.matricule}}</p><p>{{agent.grade}}</p><p>{{agent.structure}}</p></td>
<td class="r"><p><b>BURKINA FASO</b></p><p>------</p><p>La Patrie ou la Mort, Nous Vaincrons</p></td></tr>
<tr><td></td><td class="r" style="padding-top:14pt"><p>{{place}}, le {{dateShort}}</p></td></tr></table>
<p class="b" style="margin-top:14pt">A</p>
<p class="b center">{{recipient.title}}</p>
<p class="objet"><b><u>Objet</u> :</b> Jouissance de congé administratif</p>
<p style="margin-left:1.25cm">{{recipient.greeting}},</p>
<div class="body">
<p>J’ai l’honneur de solliciter auprès de votre haute bienveillance, l’obtention {{fields.durationPhrase}} de congé administratif au titre de l’année {{fields.year}} pour la période du {{fields.startFull}} au {{fields.endFull}} inclus pour en jouir {{fields.destination}}.</p>
<p>Ci-joint à ma demande une copie de ma décision de congé N°{{decision.number}} du {{decision.date}}.</p>
<p>Veuillez agréer, {{recipient.greeting}}, l’expression de ma plus haute considération.</p>
</div>
<p class="agent-sign">{{agent.fullName}}<br><span class="esign">Demande déposée le {{dateShort}} après identification par la carte n° {{agent.cardNumber}}</span></p>
${STEPS_BLOCK}
${FOOTER_REF}`
  },

  AUTORISATION_ABSENCE: {
    css: `
body { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: 12pt; line-height: 1.15; color: #000; margin: 0; }
p { margin: 0 0 8pt 0; }
table { border-collapse: collapse; width: 100%; }
td { vertical-align: top; padding: 0; }
.letterhead td { padding-bottom: 6pt; }
.lh-left { width: 52%; font-weight: bold; text-align: center; font-size: 11pt; }
.lh-mid { width: 4%; }
.lh-right { width: 44%; font-weight: bold; text-align: center; font-size: 11pt; }
.lh-left p, .lh-right p { margin: 0; }
.date-line { font-weight: normal; margin-top: 10pt; }
.agent-block { margin-top: 18pt; font-weight: bold; text-align: left; margin-left: 50%; }
.recipient-block { margin-top: 12pt; font-weight: bold; margin-left: 50%; }
.objet { font-weight: bold; font-size: 11pt; margin-top: 8pt; }
.greet { font-weight: bold; margin: 22pt 0 14pt 0; }
.body p { text-align: justify; text-indent: 1.25cm; }
.agent-sign { margin-top: 10pt; text-align: right; }
.esign { font-size: 8pt; color: #333; margin: 4pt 0 0 0; }
.frame { margin-top: 22pt; page-break-inside: avoid; break-inside: avoid; }
.frame-title { font-weight: bold; font-style: italic; text-decoration: underline; font-size: 11pt; margin-bottom: 4pt; }
.frame-result { font-weight: bold; margin: 2pt 0; }
.frame-comment { margin: 0 0 2pt 0; }
.space { height: 3cm; } .space-decision { height: 3.6cm; }
.doc-ref { display: none; }
`,
    html: `<table class="letterhead"><tr>
<td class="lh-left">{{#each header.left}}<p>{{this}}</p><p>---------------</p>{{/each}}</td>
<td class="lh-mid"></td>
<td class="lh-right"><p>BURKINA-FASO</p><p>---------------</p><p>LA PATRIE OU LA MORT, NOUS VAINCRONS</p>
<p class="date-line">{{place}}, le {{dateLong}}</p></td></tr></table>
<p class="agent-block">{{agent.displayName}}<br>Mle {{agent.matricule}}, Agent de {{agent.affectationCode}}</p>
<p class="recipient-block">A<br>{{recipient.title}}<br><u>-{{recipient.city}}-</u></p>
<p class="objet"><u>Objet</u> : demande d’autorisation d’absence de {{fields.quantityText}}</p>
<p class="greet">{{recipient.greeting}},</p>
<div class="body">
<p>J’ai l’honneur de solliciter de votre haute bienveillance, une autorisation d’absence de {{fields.quantityText}} {{fields.periodText}} pour {{fields.motif}}.</p>
<p>Veuillez agréer, <b>{{recipient.greeting}}</b>, l’expression de mon profond respect.</p>
</div>
<p class="agent-sign">{{agent.displayName}}<br><span class="esign">Demande déposée le {{dateShort}} après identification par la carte n° {{agent.cardNumber}}</span></p>
${STEPS_BLOCK}
${FOOTER_REF}`
  }
};

/** Variables documentées pour l'écran d'administration des modèles. */
export const TEMPLATE_VARIABLES = [
  'reference', 'version', 'place', 'dateShort', 'dateLong',
  'company.name', 'agent.fullName', 'agent.displayName', 'agent.matricule', 'agent.grade', 'agent.structure', 'agent.affectationCode', 'agent.cardNumber',
  'recipient.title', 'recipient.greeting', 'recipient.city', 'eStampNumber', 'header.left',
  'fields.year', 'fields.destinations', 'fields.destination', 'fields.durationPhrase', 'fields.startFull', 'fields.endFull',
  'fields.quantityText', 'fields.periodText', 'fields.motif', 'previousDecision.number', 'previousDecision.date', 'decision.number', 'decision.date',
  'steps[].heading', 'steps[].done', 'steps[].resultLabel', 'steps[].comment', 'steps[].actorName', 'steps[].actorTitle', 'steps[].decidedAt', 'steps[].hash'
];
