/*
 * mind-elixir.js — Lorevox vendored shim  (v0.2.0-lorevox-stub)
 *
 * PURPOSE
 * -------
 * A self-contained, API-compatible shim for the Mind Elixir Life Map
 * prototype. Implements exactly the constructor + method surface that
 * ui/js/life-map.js depends on, using a pure SVG radial tree renderer.
 * Zero external dependencies, zero network calls.
 *
 * REPLACING WITH THE REAL LIBRARY
 * --------------------------------
 * 1. Install:   npm install mind-elixir
 * 2. Copy:      node_modules/mind-elixir/dist/mind-elixir.umd.js  → this file
 *               node_modules/mind-elixir/dist/mind-elixir.css     → mind-elixir.css
 * 3. life-map.js needs no changes — same constructor + init() + bus API.
 *
 * SHIM API CONTRACT (matches Mind Elixir public API)
 * --------------------------------------------------
 *   const map = new MindElixir(options);
 *   map.init();
 *   map.bus.addListener("selectNode", function(nodeObj) { ... });
 *   MindElixir.LEFT   (direction constant = 0)
 *   MindElixir.RIGHT  (direction constant = 1)
 *
 * NODE OBJECT passed to selectNode listener:
 *   { id, topic, data, tags, style, children }
 *   where data = the `data` field from buildLifeMapFromLorevoxState()
 *
 * Real library: https://github.com/SSShooter/mind-elixir-core
 */

;(function (root, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.MindElixir = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /* ── Constants ───────────────────────────────────────────── */
  var LEFT  = 0;
  var RIGHT = 1;
  var SIDE  = 2;

  var SVG_NS = "http://www.w3.org/2000/svg";

  /* ── Helpers ─────────────────────────────────────────────── */
  function parseColor(style, prop, fallback) {
    return (style && style[prop]) ? style[prop] : fallback;
  }

  /* ── Flatten nodeData tree into layout-ready list ────────── */
  function flattenTree(nodeData) {
    var nodes = [];
    function walk(n, depth, parentId) {
      nodes.push({
        id:       n.id || ("n_" + nodes.length),
        topic:    n.topic || "",
        data:     n.data || {},
        tags:     n.tags || [],
        style:    n.style || {},
        depth:    depth,
        parentId: parentId || null,
        x: 0, y: 0,
        _raw: n
      });
      var self = nodes[nodes.length - 1];
      (n.children || []).forEach(function (c) {
        walk(c, depth + 1, self.id);
      });
    }
    walk(nodeData, 0, null);
    return nodes;
  }

  /* ── Radial fan layout ───────────────────────────────────────
     Root at centre.  Level-1 nodes in a full circle at radius r1.
     Level-2 nodes clustered near their parent at radius r2.
     r1 is chosen to keep adjacent nodes from overlapping even at
     narrower viewport widths (≥ 600 px practical minimum).
  ─────────────────────────────────────────────────────────────── */
  function computeLayout(nodeData, W, H) {
    var nodes = flattenTree(nodeData);
    var byId  = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    var cx = W / 2;
    var cy = H / 2;

    // Root
    var root = nodes[0];
    root.x = cx;
    root.y = cy;

    // Level-1: evenly spaced in full circle.
    // Use 0.33 * minDim so adjacent nodes have comfortable separation.
    var l1   = nodes.filter(function (n) { return n.depth === 1; });
    var minD = Math.min(W, H);
    var r1   = minD * 0.33;

    l1.forEach(function (n, i) {
      var angle = (2 * Math.PI * i / l1.length) - Math.PI / 2;
      n.x      = cx + r1 * Math.cos(angle);
      n.y      = cy + r1 * Math.sin(angle);
      n._angle = angle;
    });

    // Level-2: fan out from parent.  Use a relative radius so children
    // stay proportional regardless of canvas size.
    var r2 = minD * 0.19;

    l1.forEach(function (parent) {
      var kids = nodes.filter(function (n) {
        return n.depth === 2 && n.parentId === parent.id;
      });
      if (!kids.length) return;

      // Spread arc: 0.5 rad per child, max 120° so they don't wrap around
      var spread = Math.min(Math.PI * 0.67, kids.length * 0.50);
      var startA = parent._angle - spread / 2;

      kids.forEach(function (k, i) {
        var a = kids.length === 1
          ? parent._angle
          : startA + spread * i / (kids.length - 1);
        k.x = parent.x + r2 * Math.cos(a);
        k.y = parent.y + r2 * Math.sin(a);
      });
    });

    return { nodes: nodes, byId: byId };
  }

  /* ── Text width approximation (fixed-pitch estimate) ─────── */
  function approxWidth(text, fontSize) {
    return text.length * fontSize * 0.52 + 18;
  }

  /* ── Draw a single node as an SVG <g> ────────────────────── */
  function drawNode(node) {
    var fontSize = node.depth === 0 ? 13 : node.depth === 1 ? 11 : 10;
    var maxChars = node.depth === 0 ? 28 : node.depth === 1 ? 26 : 24;
    var text     = node.topic || "";
    if (text.length > maxChars) text = text.slice(0, maxChars - 1) + "…";

    var w = approxWidth(text, fontSize);
    var h = node.depth === 0 ? 34 : node.depth === 1 ? 28 : 22;
    var rx = h / 2;

    var bg          = parseColor(node.style, "background", "rgba(255,255,255,.07)");
    var col         = parseColor(node.style, "color",      "#e2e8f0");
    var bord        = parseColor(node.style, "border",     "1px solid rgba(255,255,255,.12)");
    var strokeColor = "rgba(255,255,255,.12)";
    var strokeWidth = 1;
    var bm = bord.match(/(\S+px)\s+solid\s+(.+)/);
    if (bm) {
      strokeWidth = parseFloat(bm[1]) || 1;
      strokeColor = bm[2];
    }

    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class",    "lv-me-node");
    g.setAttribute("data-id",  node.id);
    g.setAttribute("transform",
      "translate(" + (node.x - w / 2) + "," + (node.y - h / 2) + ")");

    // Keyboard / screen-reader accessibility for interactive nodes
    var isClickable = (node.data.kind === "era" || node.data.kind === "memory");
    if (isClickable) {
      g.setAttribute("role",     "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-label",
        (node.data.kind === "era" ? "Navigate to " : "Memory in ") + text);
    } else {
      g.setAttribute("role",     "presentation");
      g.setAttribute("aria-hidden", "true");
    }

    var rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width",        w);
    rect.setAttribute("height",       h);
    rect.setAttribute("rx",           rx);
    rect.setAttribute("ry",           rx);
    rect.setAttribute("fill",         bg);
    rect.setAttribute("stroke",       strokeColor);
    rect.setAttribute("stroke-width", strokeWidth);

    var label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x",           w / 2);
    label.setAttribute("y",           h / 2 + fontSize * 0.38);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size",   fontSize + "px");
    label.setAttribute("fill",        col);
    label.setAttribute("font-weight", node.depth === 0 ? "600" : node.depth === 1 ? "500" : "400");
    label.textContent = text;

    g.appendChild(rect);
    g.appendChild(label);

    return { g: g, w: w, h: h };
  }

  /* ── Edge: cubic bezier from parent centre to child centre ── */
  function drawEdge(parent, child) {
    var path = document.createElementNS(SVG_NS, "path");
    var dx   = (child.x - parent.x) * 0.5;
    var d = "M " + parent.x + " " + parent.y +
            " C " + (parent.x + dx) + " " + parent.y +
            "," + (child.x - dx)  + " " + child.y +
            "," + child.x + " " + child.y;
    path.setAttribute("d",            d);
    path.setAttribute("fill",         "none");
    path.setAttribute("stroke",       "rgba(148,163,184,.22)");
    path.setAttribute("stroke-width", "1.2");
    return path;
  }

  /* ── Event Bus ───────────────────────────────────────────── */
  function createBus() {
    var listeners = {};
    return {
      addListener: function (event, fn) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      },
      removeListener: function (event, fn) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(function (f) { return f !== fn; });
      },
      emit: function (event, data) {
        (listeners[event] || []).forEach(function (fn) {
          try { fn(data); } catch (_e) {}
        });
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
     MindElixir constructor
  ══════════════════════════════════════════════════════════ */
  function MindElixir(options) {
    this.options     = options || {};
    this.bus         = createBus();
    this._container  = null;
    this._svg        = null;
    this._layout     = null;
    this._selectedId = null;
    this._ro         = null;
  }

  MindElixir.prototype.init = function () {
    var opts     = this.options;
    var elSel    = opts.el || "#lifeMapHost";
    var data     = opts.data || {};
    var nodeData = data.nodeData || {};

    // Resolve container element
    var container;
    if (typeof elSel === "string") {
      container = document.querySelector(elSel);
    } else if (elSel && elSel.nodeType === 1) {
      container = elSel;
    }
    if (!container) {
      console.warn("[MindElixir-stub] container not found:", elSel);
      return;
    }

    this._container = container;
    container.innerHTML = "";
    container.classList.add("lv-me-root");

    // Use actual dims; fall back to sensible defaults if not yet laid out
    var W = container.offsetWidth  || 800;
    var H = container.offsetHeight || 560;
    if (H < 320) H = 560;

    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class",   "lv-me-svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("xmlns",   SVG_NS);
    svg.setAttribute("role",    "img");
    svg.setAttribute("aria-label", "Life Map visualisation");
    container.appendChild(svg);

    this._svg = svg;
    this._W   = W;
    this._H   = H;
    this._nodeData = nodeData;  // keep reference for resize re-renders

    this._render(nodeData, W, H);

    // Re-layout on container resize (e.g. sidebar toggle, window resize)
    var self = this;
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(function () {
        var nW = container.offsetWidth  || W;
        var nH = container.offsetHeight || H;
        if (nW < 100 || nH < 100) return;          // ignore degenerate dims
        if (nW === self._W && nH === self._H) return; // nothing changed
        self._W = nW;
        self._H = nH;
        svg.setAttribute("viewBox", "0 0 " + nW + " " + nH);
        self._render(self._nodeData, nW, nH);
      });
      this._ro.observe(container);
    }
  };

  MindElixir.prototype._render = function (nodeData, W, H) {
    var svg    = this._svg;
    var self   = this;
    var layout = computeLayout(nodeData, W, H);
    this._layout = layout;

    // Clear previous frame
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Hint text
    var hint = document.createElementNS(SVG_NS, "text");
    hint.setAttribute("class",       "lv-me-hint");
    hint.setAttribute("x",           W - 8);
    hint.setAttribute("y",           H - 8);
    hint.setAttribute("text-anchor", "end");
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "Click a life period to navigate · Hornelore Life Map";
    svg.appendChild(hint);

    // Edges (behind nodes)
    var edgeGroup = document.createElementNS(SVG_NS, "g");
    edgeGroup.setAttribute("class",       "lv-me-edges");
    edgeGroup.setAttribute("aria-hidden", "true");
    svg.appendChild(edgeGroup);

    layout.nodes.forEach(function (node) {
      if (!node.parentId) return;
      var parent = layout.byId[node.parentId];
      if (!parent) return;
      edgeGroup.appendChild(drawEdge(parent, node));
    });

    // Nodes
    var nodeGroup = document.createElementNS(SVG_NS, "g");
    nodeGroup.setAttribute("class", "lv-me-nodes");
    svg.appendChild(nodeGroup);

    layout.nodes.forEach(function (node) {
      var result = drawNode(node);
      var g      = result.g;

      // Restore selected highlight across re-renders
      if (self._selectedId === node.id) {
        g.classList.add("lv-me-selected");
      }

      // Click handler
      g.addEventListener("click", function (e) {
        e.stopPropagation();
        svg.querySelectorAll(".lv-me-node.lv-me-selected").forEach(function (el) {
          el.classList.remove("lv-me-selected");
        });
        g.classList.add("lv-me-selected");
        self._selectedId = node.id;
        self.bus.emit("selectNode", node._raw);
      });

      // Keyboard: Enter / Space activate the node
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          g.dispatchEvent(new MouseEvent("click", { bubbles: false }));
        }
      });

      nodeGroup.appendChild(g);
    });
  };

  MindElixir.prototype.destroy = function () {
    if (this._ro) {
      try { this._ro.disconnect(); } catch (_e) {}
      this._ro = null;
    }
    if (this._container) {
      this._container.innerHTML = "";
      this._container.classList.remove("lv-me-root");
    }
    this._svg      = null;
    this._layout   = null;
    this._nodeData = null;
  };

  /* ── Static constants ────────────────────────────────────── */
  MindElixir.LEFT  = LEFT;
  MindElixir.RIGHT = RIGHT;
  MindElixir.SIDE  = SIDE;

  return MindElixir;
});
