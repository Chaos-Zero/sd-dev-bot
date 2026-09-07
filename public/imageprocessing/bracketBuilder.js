/**
 * Draws a track's run through a tournament as a bracket ladder.
 *
 * Pure and offline: takes the summary from trackHistory.js and returns a PNG
 * buffer. No network, no Discord, no database, so it can be rendered and
 * eyeballed straight from a script.
 *
 * Laid out vertically rather than as a left-to-right bracket on purpose.
 * Discord scales an embed image down to roughly 550px wide, so eight rounds
 * across would put the track titles below the point of legibility; running the
 * rounds down the page keeps the column wide enough to read while the spine
 * down the left still reads as a bracket.
 *
 * Sticks to the canvas 2.x API that package.json pins -- no roundRect, no
 * filter, no createConicGradient.
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
  loss: "#ed4245",
  accent: "#faa61a",
  spine: "#4e5058",
};

const LAYOUT = {
  width: 760,
  pad: 24,
  // deep enough that the rule clears the record line's baseline rather than
  // striking through it
  headerHeight: 114,
  rowGap: 14,
  boxHeight: 34,
  boxGap: 6,
  spineX: 58,
  labelWidth: 46,
  footerGap: 18,
  footerHeight: 40,
  radius: 6,
};

/** Rounded rectangle path -- canvas 2.x has no roundRect of its own. */
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

/** Trim to fit, with an ellipsis, so a long game title cannot overrun its box. */
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

/**
 * The round's own number, except for the two matches we can identify for
 * certain: the decider and a third-place playoff. Stage names are not guessed
 * from the round number -- most brackets here are irregular enough that
 * counting back from the final labelled two different matches "QF".
 */
function roundLabel(round) {
  if (round.isThirdPlace || round.isPlayoff) return "3rd";
  if (round.isFinal) return "Final";
  if (round.stage === "Semi-final") return "SF";
  if (round.stage === "Quarter-final") return "QF";
  return "R" + round.round;
}

/**
 * The "LIVE" flag in the top corner of a run from a contest still being played.
 * Drawn rather than written into the header line so it survives the header
 * being trimmed to fit, which is where a long track name would otherwise push
 * it off the image.
 */
function drawLiveBadge(ctx, right, y) {
  const label = "LIVE";
  ctx.font = "bold 11px sans-serif";
  const width = ctx.measureText(label).width + 20;
  const height = 20;
  const x = right - width;

  roundedRect(ctx, x, y, width, height, 4);
  ctx.fillStyle = "rgba(237,66,69,0.18)";
  ctx.fill();
  roundedRect(ctx, x, y, width, height, 4);
  ctx.strokeStyle = THEME.loss;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = THEME.loss;
  ctx.fillText(label, x + width / 2, y + 14);
  ctx.textAlign = "left";

  return width;
}

function rowHeight(round) {
  const boxes = 1 + round.opponents.length;
  return boxes * LAYOUT.boxHeight + (boxes - 1) * LAYOUT.boxGap;
}

/**
 * One competitor's box: name, game, points, and a bar showing its share of the
 * vote so a landslide and a squeaker do not look identical.
 */
function drawEntrantBox(ctx, x, y, w, entrant, opts) {
  const { isSelf, won, share } = opts;

  roundedRect(ctx, x, y, w, LAYOUT.boxHeight, LAYOUT.radius);
  ctx.fillStyle = isSelf ? "#33363d" : THEME.panel;
  ctx.fill();

  // the share bar sits behind the text, clipped to the box
  if (share > 0) {
    ctx.save();
    roundedRect(ctx, x, y, w, LAYOUT.boxHeight, LAYOUT.radius);
    ctx.clip();
    ctx.fillStyle = isSelf ? "rgba(250,166,26,0.16)" : "rgba(255,255,255,0.05)";
    ctx.fillRect(x, y, w * share, LAYOUT.boxHeight);
    ctx.restore();
  }

  roundedRect(ctx, x, y, w, LAYOUT.boxHeight, LAYOUT.radius);
  ctx.strokeStyle = isSelf ? THEME.accent : THEME.panelEdge;
  ctx.lineWidth = isSelf ? 1.6 : 1;
  ctx.stroke();

  // points, right-aligned, with the column reserved before the name is drawn
  const pointsText = String(entrant.points);
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = isSelf ? THEME.accent : THEME.dim;
  ctx.fillText(pointsText, x + w - 12, y + 22);
  const pointsWidth = ctx.measureText(pointsText).width + 24;

  ctx.textAlign = "left";
  const textX = x + 12;
  const available = w - pointsWidth - 22;

  ctx.font = isSelf ? "bold 14px sans-serif" : "14px sans-serif";
  ctx.fillStyle = isSelf ? THEME.text : THEME.dim;
  const name = fitText(ctx, entrant.name, available);
  ctx.fillText(name, textX, isSelf ? y + 22 : y + 15);

  if (!isSelf) {
    ctx.font = "11px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.fillText(fitText(ctx, entrant.title || "", available), textX, y + 28);
  }
}

/**
 * Render the run. `summary` is what SummariseTrackRun returns; `track` carries
 * the display name and game for the header.
 */
function RenderTrackProgression({ track, tournamentName, summary }) {
  if (!summary || !Array.isArray(summary.progression) || !summary.progression.length) {
    return null;
  }

  const rounds = summary.progression;
  // A live contest gets a second footer line saying so, because the ladder on
  // its own looks exactly like a finished run that happened to end early.
  const liveNote = !summary.isRunning
    ? ""
    : summary.stillIn
    ? "This tournament is still being played — the run is not over"
    : "This tournament is still being played — later rounds are still to come";
  const bodyHeight =
    rounds.reduce((total, round) => total + rowHeight(round) + LAYOUT.rowGap, 0) -
    LAYOUT.rowGap;
  const footerTop = LAYOUT.headerHeight + bodyHeight + LAYOUT.footerGap;
  const height = footerTop + LAYOUT.footerHeight + (liveNote ? 22 : 0);

  const canvas = createCanvas(LAYOUT.width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, LAYOUT.width, height);

  // ---- header -------------------------------------------------------------
  const headerRight = LAYOUT.width - LAYOUT.pad;
  const badgeWidth = summary.isRunning
    ? drawLiveBadge(ctx, headerRight, LAYOUT.pad + 3) + 12
    : 0;
  ctx.textAlign = "left";
  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = THEME.text;
  ctx.fillText(
    fitText(ctx, track.name, headerRight - LAYOUT.pad - badgeWidth),
    LAYOUT.pad,
    LAYOUT.pad + 20
  );

  ctx.font = "14px sans-serif";
  ctx.fillStyle = THEME.dim;
  ctx.fillText(
    fitText(ctx, track.title || "", headerRight - LAYOUT.pad),
    LAYOUT.pad,
    LAYOUT.pad + 41
  );

  ctx.font = "12px sans-serif";
  ctx.fillStyle = THEME.faint;
  const record = `${tournamentName}   ·   ${summary.placement}   ·   ${summary.wins}W-${summary.losses}L   ·   ${summary.totalVotes} votes`;
  ctx.fillText(fitText(ctx, record, headerRight - LAYOUT.pad), LAYOUT.pad, LAYOUT.pad + 62);

  ctx.strokeStyle = THEME.panelEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LAYOUT.pad, LAYOUT.headerHeight - 12);
  ctx.lineTo(headerRight, LAYOUT.headerHeight - 12);
  ctx.stroke();

  // ---- rounds -------------------------------------------------------------
  const boxX = LAYOUT.spineX + 22;
  const boxW = LAYOUT.width - boxX - LAYOUT.pad;
  let y = LAYOUT.headerHeight;

  rounds.forEach((round, index) => {
    const h = rowHeight(round);
    const selfShare = round.totalVotes > 0 ? round.self.points / round.totalVotes : 0;

    // spine linking this round to the next
    if (index < rounds.length - 1) {
      ctx.strokeStyle = THEME.spine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(LAYOUT.spineX, y + LAYOUT.boxHeight / 2);
      ctx.lineTo(LAYOUT.spineX, y + h + LAYOUT.rowGap + LAYOUT.boxHeight / 2);
      ctx.stroke();
    }

    // round marker
    ctx.beginPath();
    ctx.arc(LAYOUT.spineX, y + LAYOUT.boxHeight / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = round.won === true ? THEME.win : round.won === false ? THEME.loss : THEME.faint;
    ctx.fill();

    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.textAlign = "right";
    const label = roundLabel(round);
    ctx.fillText(label, LAYOUT.spineX - 12, y + LAYOUT.boxHeight / 2 + 4);
    if (summary.isDoubleElim && round.bracket) {
      ctx.font = "9px sans-serif";
      ctx.fillStyle = round.bracket === "losersBracket" ? THEME.loss : THEME.faint;
      ctx.fillText(
        round.bracket === "losersBracket" ? "LOSERS" : "WINNERS",
        LAYOUT.spineX - 12,
        y + LAYOUT.boxHeight / 2 + 32
      );
    }
    ctx.textAlign = "left";

    // the track itself, then everyone it faced
    drawEntrantBox(ctx, boxX, y, boxW, round.self, {
      isSelf: true,
      won: round.won === true,
      share: selfShare,
    });

    let oy = y + LAYOUT.boxHeight + LAYOUT.boxGap;
    for (const opponent of round.opponents) {
      drawEntrantBox(ctx, boxX, oy, boxW, opponent, {
        isSelf: false,
        won: round.won === false && opponent.points > round.self.points,
        share: round.totalVotes > 0 ? opponent.points / round.totalVotes : 0,
      });
      oy += LAYOUT.boxHeight + LAYOUT.boxGap;
    }

    // margin, tucked against the spine
    ctx.font = "11px sans-serif";
    ctx.fillStyle = round.won === true ? THEME.win : THEME.loss;
    ctx.textAlign = "right";
    if (round.won !== null) {
      const sign = round.margin > 0 ? "+" : "";
      ctx.fillText(sign + round.margin, LAYOUT.spineX - 12, y + LAYOUT.boxHeight / 2 + 20);
    }
    ctx.textAlign = "left";

    y += h + LAYOUT.rowGap;
  });

  // ---- summary ------------------------------------------------------------
  ctx.font = "bold 17px sans-serif";
  ctx.fillStyle = summary.isChampion
    ? THEME.accent
    : summary.stillIn
    ? THEME.win
    : summary.isPodium
    ? THEME.text
    : THEME.dim;
  ctx.textAlign = "left";
  ctx.fillText(
    fitText(ctx, summary.exit, LAYOUT.width - LAYOUT.pad * 2),
    LAYOUT.pad,
    footerTop + 20
  );

  if (liveNote) {
    ctx.font = "12px sans-serif";
    ctx.fillStyle = THEME.faint;
    ctx.fillText(
      fitText(ctx, liveNote, LAYOUT.width - LAYOUT.pad * 2),
      LAYOUT.pad,
      footerTop + 40
    );
  }

  return canvas.toBuffer("image/png");
}

if (typeof module !== "undefined") {
  module.exports = {
    RenderTrackProgression,
  };
}
