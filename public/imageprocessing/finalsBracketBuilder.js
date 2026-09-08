/**
 * Draws a tournament's bracket as a tree.
 *
 * Pure and offline: takes the tree from tournamentResults.js and returns a PNG
 * buffer. No network, no Discord, no database.
 *
 * Laid out from the tree rather than from round numbers, because these brackets
 * are irregular -- byes and tie replays mean a round can hold an odd number of
 * matches and a track can play twice in one. Leaves take a slot each and every
 * parent centres on its children, so a ragged branch still lines up.
 *
 * Two densities: the default for the closing rounds, and a compact one for a
 * whole contest, where 64 first-round matches would otherwise run to thousands
 * of pixels at readable box sizes. The compact view is a poster to be opened
 * full size rather than read inline.
 *
 * Sticks to the canvas 2.x API that package.json pins -- no roundRect.
 */

const { createCanvas } = require("canvas");

const THEME = {
  bg: "#1e1f22",
  panel: "#2b2d31",
  panelEdge: "#3f4147",
  text: "#f2f3f5",
  dim: "#b5bac1",
  faint: "#80848e",
  win: "#3ba55d",
  gold: "#faa61a",
  line: "#4e5058",
  rule: "#3f4147",
};

const DENSITY = {
  normal: {
    colWidth: 168,
    colGap: 26,
    boxHeight: 30,
    boxGap: 4,
    blockGap: 16,
    nameFont: 12,
    pointFont: 12,
    winnerWidth: 150,
    radius: 5,
  },
  compact: {
    colWidth: 116,
    colGap: 14,
    boxHeight: 14,
    boxGap: 1,
    blockGap: 4,
    nameFont: 9,
    pointFont: 9,
    winnerWidth: 120,
    radius: 3,
  },
};

const PAD = 22;
const HEADER_HEIGHT = 96;

// Column names are only used where the column is the size that name implies --
// four matches really is a quarter-final round. A ragged column is left unnamed
// rather than mislabelled.
const COLUMN_NAMES = [
  [1, "FINAL"],
  [2, "SEMI-FINALS"],
  [4, "QUARTER-FINALS"],
  [8, "LAST 16"],
  [16, "LAST 32"],
  [32, "LAST 64"],
  [64, "LAST 128"],
  [128, "LAST 256"],
];

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  const value = String(text == null ? "" : text);
  if (ctx.measureText(value).width <= maxWidth) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(value.slice(0, mid) + "…").width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return value.slice(0, low) + "…";
}

function blockHeight(d) {
  return d.boxHeight * 2 + d.boxGap;
}

function drawEntrant(ctx, x, y, entrant, d, champion, highlighted) {
  const won = entrant.won === true;
  const accent = champion || highlighted;

  roundedRect(ctx, x, y, d.colWidth, d.boxHeight, d.radius);
  ctx.fillStyle = won ? "#33363d" : THEME.panel;
  ctx.fill();
  roundedRect(ctx, x, y, d.colWidth, d.boxHeight, d.radius);
  ctx.strokeStyle = accent ? THEME.gold : won ? THEME.win : THEME.panelEdge;
  ctx.lineWidth = accent ? 1.8 : 1;
  ctx.stroke();

  const baseline = y + d.boxHeight / 2 + d.nameFont * 0.36;

  ctx.font = `bold ${d.pointFont}px sans-serif`;
  ctx.textAlign = "right";
  ctx.fillStyle = accent ? THEME.gold : won ? THEME.text : THEME.faint;
  const points = String(entrant.points);
  ctx.fillText(points, x + d.colWidth - 6, baseline);
  const pointsWidth = ctx.measureText(points).width + 12;

  ctx.textAlign = "left";
  ctx.font = won || highlighted
    ? `bold ${d.nameFont}px sans-serif`
    : `${d.nameFont}px sans-serif`;
  ctx.fillStyle = won || highlighted ? THEME.text : THEME.dim;
  ctx.fillText(
    fitText(ctx, entrant.name, d.colWidth - pointsWidth - 12),
    x + 6,
    baseline
  );
}

function connect(ctx, fromX, fromY, toX, toY) {
  const midX = fromX + (toX - fromX) / 2;
  ctx.strokeStyle = THEME.line;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(midX, fromY);
  ctx.lineTo(midX, toY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

/**
 * Give every node a slot: leaves in order, parents centred between their
 * children. Returns the nodes, the depth reached and the total height.
 */
function layout(root, d) {
  const slot = blockHeight(d) + d.blockGap;
  const nodes = [];
  let taken = 0;
  let maxDepth = 0;

  const place = (node) => {
    maxDepth = Math.max(maxDepth, node.depth);
    nodes.push(node);
    if (!node.children.length) {
      node.centre = taken * slot + blockHeight(d) / 2;
      taken += 1;
      return node.centre;
    }
    const centres = node.children.map(place);
    node.centre = (Math.min(...centres) + Math.max(...centres)) / 2;
    return node.centre;
  };

  place(root);
  return { nodes, maxDepth, height: Math.max(taken, 1) * slot };
}

function columnName(count) {
  const found = COLUMN_NAMES.find(([n]) => n === count);
  return found ? found[1] : null;
}

/**
 * Render a bracket. `tree` is what BuildBracketTree returns, `summary` supplies
 * the header facts and the podium.
 */
function RenderFinalsBracket({
  tournamentName,
  summary,
  tree,
  compact,
  // one track's run rather than a whole contest: its own heading, the same
  // closing sentence the vertical view uses, and the track picked out in gold
  // wherever it appears
  heading,
  footer,
  highlight,
}) {
  if (!tree || !tree.root) return null;
  const d = compact ? DENSITY.compact : DENSITY.normal;

  const { nodes, maxDepth, height: bodyHeight } = layout(tree.root, d);
  const columns = maxDepth + 1;
  const columnX = (depth) => PAD + (maxDepth - depth) * (d.colWidth + d.colGap);
  const finalX = columnX(0);

  const trackView = Boolean(heading);
  const thirdPlace = trackView
    ? null
    : summary?.rounds?.find((r) => r.stage === "Third-place match");
  const thirdHeight = thirdPlace ? blockHeight(d) + 34 : 0;

  const footerHeight = footer ? 42 : 0;
  const treeWidth =
    finalX + d.colWidth + (trackView ? PAD : 16 + d.winnerWidth + PAD);
  // A short run gives a narrow tree -- a first-round exit is one box -- which
  // would crop the heading and the closing line. Measure them and let the text
  // set the width when it is the wider of the two.
  const width = Math.max(treeWidth, textWidth(heading, footer) + PAD * 2);
  const bodyTop = HEADER_HEIGHT;
  const height =
    Math.max(
      bodyTop + bodyHeight,
      bodyTop + tree.root.centre + blockHeight(d) / 2 + thirdHeight
    ) + footerHeight + PAD;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, width, height);

  // ---- header -------------------------------------------------------------
  ctx.textAlign = "left";
  ctx.font = "bold 21px sans-serif";
  ctx.fillStyle = THEME.text;
  ctx.fillText(
    fitText(ctx, heading ? heading.title : tournamentName, width - PAD * 2),
    PAD,
    PAD + 19
  );

  ctx.fillStyle = THEME.faint;
  if (heading) {
    ctx.font = "13px sans-serif";
    ctx.fillStyle = THEME.dim;
    ctx.fillText(fitText(ctx, heading.subtitle || "", width - PAD * 2), PAD, PAD + 38);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.fillText(fitText(ctx, heading.facts || "", width - PAD * 2), PAD, PAD + 56);
  } else {
    ctx.font = "12px sans-serif";
    const facts = [`${summary.entrants} entrants`, `${summary.matches} matches`];
    if (summary.votes) facts.push(`${summary.votes} votes`);
    if (summary.lastMatchAt) facts.push(summary.lastMatchAt.slice(0, 10));
    if (compact && tree.unreached) {
      facts.push(`${tree.unreached} replays not on the bracket`);
    }
    ctx.fillText(facts.join("   ·   "), PAD, PAD + 40);
  }

  // a rule between the facts and the column headings, so they do not read as
  // one run-on line
  ctx.strokeStyle = THEME.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ruleY = heading ? PAD + 70 : PAD + 54;
  ctx.moveTo(PAD, ruleY);
  ctx.lineTo(width - PAD, ruleY);
  ctx.stroke();

  // ---- column headings ----------------------------------------------------
  const perColumn = new Map();
  for (const node of nodes) {
    perColumn.set(node.depth, (perColumn.get(node.depth) || 0) + 1);
  }
  ctx.font = "bold 10px sans-serif";
  for (const [depth, count] of trackView ? [] : perColumn) {
    const label = columnName(count);
    if (!label) continue;
    ctx.fillStyle = depth === 0 ? THEME.gold : THEME.faint;
    ctx.fillText(label, columnX(depth), HEADER_HEIGHT - 10);
  }

  // ---- the tree -----------------------------------------------------------
  for (const node of nodes) {
    const x = columnX(node.depth);
    const top = bodyTop + node.centre - blockHeight(d) / 2;
    // In a track view the queried song always takes the upper box, so the run
    // reads as one line across the page with the beaten opponents hanging below
    // it. Elsewhere the higher score leads, as a bracket normally shows.
    const entrants = node.match.entrants.slice(0, 2);
    if (trackView && highlight && entrants.length === 2 && highlight(entrants[1])) {
      entrants.reverse();
    }
    entrants.forEach((entrant, slot) => {
      drawEntrant(
        ctx,
        x,
        top + slot * (d.boxHeight + d.boxGap),
        entrant,
        d,
        !trackView && node.depth === 0 && entrant.won === true,
        highlight ? highlight(entrant) : false
      );
    });

    // the spine runs through the song's own box rather than the block centre,
    // so the connector is visible instead of hiding in the gap between boxes
    const spine = trackView ? -(blockHeight(d) / 2 - d.boxHeight / 2) : 0;
    for (const child of node.children) {
      connect(
        ctx,
        columnX(child.depth) + d.colWidth,
        bodyTop + child.centre + spine,
        x,
        bodyTop + node.centre + spine
      );
    }
  }

  // ---- the winner ---------------------------------------------------------
  const winner = trackView ? null : summary?.podium?.winner;
  if (winner) {
    const x = finalX + d.colWidth + 16;
    const centre = bodyTop + tree.root.centre;
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = THEME.gold;
    ctx.fillText("WINNER", x, HEADER_HEIGHT - 10);
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(fitText(ctx, winner.name, d.winnerWidth - 8), x, centre - 2);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.fillText(fitText(ctx, winner.title || "", d.winnerWidth - 8), x, centre + 12);
    connect(ctx, finalX + d.colWidth, centre, x - 6, centre);
  }

  // ---- third place, under the final and in its column ---------------------
  if (thirdPlace) {
    const top = bodyTop + tree.root.centre + blockHeight(d) / 2 + 34;
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.textAlign = "left";
    ctx.fillText("THIRD-PLACE MATCH", finalX, top - 10);
    thirdPlace.matches[0].entrants.slice(0, 2).forEach((entrant, slot) => {
      drawEntrant(ctx, finalX, top + slot * (d.boxHeight + d.boxGap), entrant, d, false);
    });
  }

  // ---- closing line, worded exactly as the vertical view ------------------
  if (footer) {
    ctx.textAlign = "left";
    ctx.font = "bold 17px sans-serif";
    ctx.fillStyle = footerColour(summary);
    ctx.fillText(footer, PAD, height - PAD - 4);
  }

  return canvas.toBuffer("image/png");
}

/** Widest of the heading and footer lines, measured at the fonts used below. */
function textWidth(heading, footer) {
  if (!heading && !footer) return 0;
  const scratch = createCanvas(8, 8).getContext("2d");
  const widths = [];
  if (heading) {
    scratch.font = "bold 21px sans-serif";
    widths.push(scratch.measureText(heading.title || "").width);
    scratch.font = "13px sans-serif";
    widths.push(scratch.measureText(heading.subtitle || "").width);
    scratch.font = "12px sans-serif";
    widths.push(scratch.measureText(heading.facts || "").width);
  }
  if (footer) {
    scratch.font = "bold 17px sans-serif";
    widths.push(scratch.measureText(footer).width);
  }
  return Math.ceil(Math.max(0, ...widths));
}

function footerColour(summary) {
  if (summary?.isChampion) return THEME.gold;
  return summary?.isPodium ? THEME.text : THEME.dim;
}

if (typeof module !== "undefined") {
  module.exports = {
    RenderFinalsBracket,
  };
}
