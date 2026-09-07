/**
 * Draws the closing rounds of a finished tournament as a bracket tree.
 *
 * Pure and offline: takes the summary from tournamentResults.js and returns a
 * PNG buffer. No network, no Discord, no database.
 *
 * Left to right, quarter-finals through to the winner, with the third-place
 * playoff underneath. Unlike a single track's run -- which is laid out
 * vertically because eight rounds across would be unreadable -- a finals tree
 * is only ever four columns deep, so it fits the width Discord gives an embed
 * image while still reading as a bracket.
 *
 * Track names are truncated to fit their box; the embed alongside carries the
 * podium in full, with links.
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
};

// room for the champion's name beyond the final, so it is not truncated to
// initials the way an ordinary box would be
const WINNER_WIDTH = 150;

const L = {
  pad: 22,
  colWidth: 168,
  colGap: 26,
  boxHeight: 30,
  boxGap: 4,
  blockGap: 16,
  headerHeight: 84,
  radius: 5,
};

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

function drawEntrant(ctx, x, y, entrant, opts) {
  const { champion } = opts || {};
  const won = entrant.won === true;

  roundedRect(ctx, x, y, L.colWidth, L.boxHeight, L.radius);
  ctx.fillStyle = won ? "#33363d" : THEME.panel;
  ctx.fill();
  roundedRect(ctx, x, y, L.colWidth, L.boxHeight, L.radius);
  ctx.strokeStyle = champion ? THEME.gold : won ? THEME.win : THEME.panelEdge;
  ctx.lineWidth = champion ? 1.8 : 1;
  ctx.stroke();

  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = champion ? THEME.gold : won ? THEME.text : THEME.faint;
  const points = String(entrant.points);
  ctx.fillText(points, x + L.colWidth - 8, y + 19);
  const pointsWidth = ctx.measureText(points).width + 16;

  ctx.textAlign = "left";
  ctx.font = won ? "bold 12px sans-serif" : "12px sans-serif";
  ctx.fillStyle = won ? THEME.text : THEME.dim;
  ctx.fillText(
    fitText(ctx, entrant.name, L.colWidth - pointsWidth - 16),
    x + 8,
    y + 19
  );
}

/** Elbow connector from a match block into the next column. */
function connect(ctx, fromX, fromY, toX, toY) {
  const midX = fromX + (toX - fromX) / 2;
  ctx.strokeStyle = THEME.line;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(midX, fromY);
  ctx.lineTo(midX, toY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

function blockHeight() {
  return L.boxHeight * 2 + L.boxGap;
}

/**
 * Render the finals. `summary` is what BuildFinalsSummary returns.
 * Returns null when there is nothing beyond a single match to draw.
 */
function RenderFinalsBracket({ tournamentName, summary }) {
  if (!summary || !summary.rounds.length) return null;

  const columns = summary.rounds.filter((r) => r.stage !== "Third-place match");
  if (!columns.length) return null;
  const thirdPlace = summary.rounds.find((r) => r.stage === "Third-place match");

  const first = columns[0].matches.length;
  const bodyHeight = first * blockHeight() + (first - 1) * L.blockGap;
  const width =
    L.pad * 2 + columns.length * L.colWidth + (columns.length - 1) * L.colGap + WINNER_WIDTH;
  const thirdHeight = thirdPlace ? blockHeight() + 42 : 0;
  const height = L.headerHeight + bodyHeight + thirdHeight + L.pad + 16;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, width, height);

  // ---- header -------------------------------------------------------------
  ctx.textAlign = "left";
  ctx.font = "bold 21px sans-serif";
  ctx.fillStyle = THEME.text;
  ctx.fillText(fitText(ctx, tournamentName, width - L.pad * 2), L.pad, L.pad + 19);

  ctx.font = "12px sans-serif";
  ctx.fillStyle = THEME.faint;
  const bits = [`${summary.entrants} entrants`, `${summary.matches} matches`];
  if (summary.votes) bits.push(`${summary.votes} votes`);
  if (summary.lastMatchAt) bits.push(summary.lastMatchAt.slice(0, 10));
  ctx.fillText(bits.join("   ·   "), L.pad, L.pad + 40);

  // ---- columns ------------------------------------------------------------
  const centres = [];
  columns.forEach((column, index) => {
    const x = L.pad + index * (L.colWidth + L.colGap);
    const columnCentres = [];

    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.fillText(column.stage.toUpperCase(), x, L.headerHeight - 8);

    column.matches.forEach((match, position) => {
      let top;
      if (index === 0) {
        top = L.headerHeight + position * (blockHeight() + L.blockGap);
      } else {
        // sit halfway between the two blocks that fed this one
        const feeders = centres[index - 1];
        const a = feeders[position * 2];
        const b = feeders[position * 2 + 1];
        const centre = b === undefined ? a : (a + b) / 2;
        top = centre - blockHeight() / 2;
      }

      const entrants = match.entrants.slice(0, 2);
      entrants.forEach((entrant, slot) => {
        const y = top + slot * (L.boxHeight + L.boxGap);
        drawEntrant(ctx, x, y, entrant, {
          champion:
            column.stage === "Final" && entrant.won === true,
        });
      });

      const centre = top + blockHeight() / 2;
      columnCentres.push(centre);

      if (index > 0) {
        const feeders = centres[index - 1];
        const prevX = x - L.colGap;
        for (const feeder of [feeders[position * 2], feeders[position * 2 + 1]]) {
          if (feeder === undefined) continue;
          connect(ctx, prevX, feeder, x, centre);
        }
      }
    });

    centres.push(columnCentres);
  });

  // ---- the winner ---------------------------------------------------------
  const finalColumn = columns[columns.length - 1];
  if (finalColumn.stage === "Final" && summary.podium.winner) {
    const x =
      L.pad + columns.length * (L.colWidth + L.colGap);
    const centre = centres[centres.length - 1][0];
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = THEME.gold;
    ctx.fillText("WINNER", x, L.headerHeight - 8);

    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = THEME.gold;
    const room = WINNER_WIDTH - L.pad;
    ctx.fillText(fitText(ctx, summary.podium.winner.name, room), x, centre - 2);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.fillText(
      fitText(ctx, summary.podium.winner.title || "", room),
      x,
      centre + 12
    );
    connect(ctx, x - L.colGap, centre, x - 6, centre);
  }

  // ---- third place --------------------------------------------------------
  if (thirdPlace) {
    const top = L.headerHeight + bodyHeight + 30;
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.fillText("THIRD-PLACE MATCH", L.pad, top - 8);
    thirdPlace.matches[0].entrants.slice(0, 2).forEach((entrant, slot) => {
      drawEntrant(
        ctx,
        L.pad,
        top + slot * (L.boxHeight + L.boxGap),
        entrant,
        {}
      );
    });
  }

  return canvas.toBuffer("image/png");
}

if (typeof module !== "undefined") {
  module.exports = {
    RenderFinalsBracket,
  };
}
