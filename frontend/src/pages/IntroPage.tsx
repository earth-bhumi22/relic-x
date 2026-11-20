// Owner: A (Arvind)
// Intro page: shown once to first-time visitors (App.tsx) and always reachable from the navbar.
// Pure presentation: scroll-triggered reveals, an assembling tile panel, and small diagrams of each pipeline stage.
// No API calls and no images to load; the artwork is drawn in lib/introArt.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { markIntroSeen } from "../lib/intro";
import { panelDataUri, SCATTER, TECHNIQUES } from "../lib/introArt";
import ThemeToggle from "../components/layout/ThemeToggle";
import "./intro.css";

/** Adds `is-in` the first time the element scrolls into view. Without IntersectionObserver it is simply visible. */
function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <Tag
      ref={ref as never}
      className={`reveal ${seen ? "is-in" : ""} ${className}`}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

function TilePanel({ assembled, onToggle }: { assembled: boolean; onToggle: () => void }) {
  const art = useMemo(panelDataUri, []);
  return (
    <div className="panel-wrap">
      <div
        className={`panel ${assembled ? "is-assembled" : ""}`}
        style={{ "--art": art } as CSSProperties}
        aria-hidden="true"
      >
        {SCATTER.map((s, i) => (
          <span
            key={i}
            className="ptile"
            style={
              {
                "--c": i % 4,
                "--r": Math.floor(i / 4),
                "--tx": `${s.tx}%`,
                "--ty": `${s.ty}%`,
                "--rot": `${s.rot}deg`,
                "--i": i,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <button type="button" className="btn panel-toggle" onClick={onToggle}>
        {assembled ? "Shatter it" : "Put it back together"}
      </button>
    </div>
  );
}

const TICKER = [
  "Hashing",
  "KMP",
  "Rabin–Karp",
  "LCS",
  "Edit distance",
  "BFS · DFS",
  "Greedy",
  "Prim",
  "Dijkstra",
  "Backtracking",
  "Branch & bound",
];

const STEPS = [
  {
    n: "01",
    title: "Cut",
    text: "An artifact image is cut into a grid of square fragments, shuffled, and rotated in 90° steps. The true layout is kept aside so results can be measured.",
  },
  {
    n: "02",
    title: "Read the edges",
    text: "Each edge is read clockwise as a strip of pixels, resampled and quantised into a string of symbols. A picture problem becomes a string problem.",
  },
  {
    n: "03",
    title: "Match",
    text: "Two pieces fit when one edge reads like the other reversed. A hash pre-filter discards the hopeless pairs, then KMP, LCS and edit distance score the rest.",
  },
  {
    n: "04",
    title: "Build the graph",
    text: "Scored joins become a weighted graph. BFS and DFS find the groups; a threshold prunes weak joins.",
  },
  {
    n: "05",
    title: "Solve",
    text: "Greedy, best-first, Dijkstra or backtracking place the pieces. Every decision is recorded so you can replay it step by step.",
  },
] as const;

function StepVisual({ n }: { n: (typeof STEPS)[number]["n"] }) {
  if (n === "01")
    return (
      <div className="viz viz-cut" aria-hidden="true">
        <div className="viz-cut-art" style={{ "--art": panelDataUri() } as CSSProperties} />
        <i className="cut-h cut-h1" />
        <i className="cut-h cut-h2" />
        <i className="cut-h cut-h3" />
        <i className="cut-v cut-v1" />
        <i className="cut-v cut-v2" />
        <i className="cut-v cut-v3" />
      </div>
    );
  if (n === "02")
    return (
      <div className="viz viz-edge" aria-hidden="true">
        <div className="edge-tile" style={{ "--art": panelDataUri() } as CSSProperties} />
        <div className="edge-code">
          <span className="typed">AAQQRbbccDDeeFFgg</span>
          <span className="edge-caret" />
        </div>
      </div>
    );
  if (n === "03")
    return (
      <div className="viz viz-match" aria-hidden="true">
        <div className="mrow">
          <span>AAQ</span>
          <b>QRbbc</b>
          <span>DD</span>
        </div>
        <svg viewBox="0 0 200 26" className="mlinks">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={62 + i * 15} y1="0" x2={62 + i * 15} y2="26" style={{ "--k": i } as CSSProperties} />
          ))}
        </svg>
        <div className="mrow">
          <span>ZQ</span>
          <b>QRbbc</b>
          <span>EEF</span>
        </div>
        <p className="mscore">
          score <em>0.86</em>
        </p>
      </div>
    );
  if (n === "04")
    return (
      <svg className="viz viz-graph" viewBox="0 0 300 170" aria-hidden="true">
        {[
          [50, 40, 150, 25],
          [150, 25, 250, 55],
          [50, 40, 90, 120],
          [90, 120, 190, 135],
          [150, 25, 190, 135],
          [250, 55, 190, 135],
          [90, 120, 150, 25],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="g-edge" style={{ "--k": i } as CSSProperties} />
        ))}
        {[
          [50, 40],
          [150, 25],
          [250, 55],
          [90, 120],
          [190, 135],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="13" className="g-node" style={{ "--k": i } as CSSProperties} />
        ))}
      </svg>
    );
  return (
    <div className="viz viz-solve" aria-hidden="true">
      {[1, 2, 3, 6, 5, 4, 7, 8, 9].map((o, i) => (
        <span key={i} style={{ "--k": o } as CSSProperties}>
          {o}
        </span>
      ))}
    </div>
  );
}

export default function IntroPage() {
  const navigate = useNavigate();
  const [assembled, setAssembled] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Let the page load scattered, then snap the panel together.
  useEffect(() => {
    const t = window.setTimeout(() => setAssembled(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  // Scroll progress bar + slight parallax on the hero, written to CSS variables (no re-render).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.setProperty("--progress", String(max > 0 ? window.scrollY / max : 0));
      el.style.setProperty("--scroll", String(window.scrollY));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const enter = () => {
    markIntroSeen();
    navigate("/");
  };

  return (
    <div className="intro" ref={rootRef}>
      <div className="intro-progress" aria-hidden="true" />
      <header className="intro-bar">
        <span className="intro-brand">RELIC-X</span>
        <div className="intro-bar-end">
          <ThemeToggle />
          <button type="button" className="btn intro-skip" onClick={enter}>
            Skip intro
          </button>
        </div>
      </header>

      <section className="hero" aria-labelledby="intro-title">
        <div className="hero-copy">
          <p className="kicker">An ADA project · University of Delhi</p>
          <h1 id="intro-title" className="hero-title">
            <span>Broken things,</span> <span>put back</span> <span>together.</span>
          </h1>
          <p className="hero-lede">
            RELIC-X reassembles shattered artifacts with classical algorithms, and shows you <em>why</em> every piece
            went where it did.
          </p>
          <div className="hero-cta">
            <button type="button" className="btn btn-primary btn-big" onClick={enter}>
              Enter the lab
            </button>
            <a className="btn btn-big" href="#how">
              See how it works ↓
            </a>
          </div>
        </div>
        <TilePanel assembled={assembled} onToggle={() => setAssembled((a) => !a)} />
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[...TICKER, ...TICKER, ...TICKER].map((t, i) => (
            <span key={i}>
              {t}
              <i>✦</i>
            </span>
          ))}
        </div>
      </div>

      <section className="block problem" aria-labelledby="problem-title">
        <Reveal>
          <p className="kicker">The problem</p>
          <h2 id="problem-title" className="block-title">
            Artifacts come out of the ground in pieces.
          </h2>
        </Reveal>
        <div className="problem-grid">
          <Reveal delay={80}>
            <p className="big-text">
              Pottery, tiles and murals arrive broken, shuffled and eroded. Reassembling them by hand takes weeks.
              Treating each edge as a string lets an algorithm do the matching, and lets <em>you</em> inspect every
              decision it makes.
            </p>
          </Reveal>
          <ul className="stat-stack">
            {[
              ["2 questions", "What reconstruction did we get? And why did these two pieces join?"],
              ["9 techniques", "Hashing, string matching, DP, graphs, greedy, shortest paths, backtracking."],
              ["0 black boxes", "Every score is broken down. Every solver step is replayable."],
            ].map(([big, small], i) => (
              <Reveal as="li" key={big} delay={160 + i * 120} className="stat">
                <b>{big}</b>
                <span>{small}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="block how" id="how" aria-labelledby="how-title">
        <Reveal>
          <p className="kicker">How it works</p>
          <h2 id="how-title" className="block-title">
            Five stages, from rubble to picture.
          </h2>
        </Reveal>
        <ol className="steps-list">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} className={`step ${i % 2 ? "step-flip" : ""}`}>
              <div className="step-text">
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
              <StepVisual n={s.n} />
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="block techniques" aria-labelledby="tech-title">
        <Reveal>
          <p className="kicker">The toolbox</p>
          <h2 id="tech-title" className="block-title">
            A syllabus, put to work.
          </h2>
          <p className="block-sub">
            Every technique has a real job in the pipeline. Complexities are the ones derived in the docs.
          </p>
        </Reveal>
        <ul className="tech-grid">
          {TECHNIQUES.map((t, i) => (
            <Reveal as="li" key={t.name} delay={(i % 3) * 90} className="tech">
              <span className="tech-topic">{t.topic}</span>
              <h3>{t.name}</h3>
              <p>{t.job}</p>
              <code>{t.cost}</code>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="block why" aria-labelledby="why-title">
        <Reveal>
          <p className="kicker">Explainable by design</p>
          <h2 id="why-title" className="block-title">
            “Why did these two match?”
          </h2>
        </Reveal>
        <Reveal delay={100} className="why-demo">
          <div className="why-score-big" title="Illustrative numbers">
            0.86
          </div>
          <div className="why-bars" aria-hidden="true">
            {[
              ["Colour", 18, "var(--sig-color)"],
              ["LCS", 26, "var(--sig-lcs)"],
              ["Edit", 20, "var(--sig-edit)"],
              ["Motif", 14, "var(--sig-motif)"],
              ["Hash", 8, "var(--sig-hash)"],
            ].map(([label, w, color], i) => (
              <div key={label} className="why-bar" style={{ "--w": `${w}%`, "--c": color, "--k": i } as CSSProperties}>
                <span>{label}</span>
                <i />
              </div>
            ))}
          </div>
          <p className="why-copy">
            Open any join in the app and its score splits into five signals, with the shared run, the edit script and
            the solver trace laid out so you can check the algorithm’s reasoning yourself.{" "}
            <em className="why-note">(Numbers shown here are illustrative.)</em>
          </p>
        </Reveal>
      </section>

      <section className="block honest" aria-labelledby="honest-title">
        <Reveal>
          <p className="kicker">Before you demo anything</p>
          <h2 id="honest-title" className="block-title">
            Honest about its limits.
          </h2>
        </Reveal>
        <ul className="honest-list">
          {[
            [
              "Synthetic fragments",
              "Accuracy is measured on artifacts cut from a known image. Uploaded fragments can be solved, but have no ground truth to score against.",
            ],
            [
              "Backtracking is exponential",
              "It runs with a node limit. When that limit is hit the run is marked truncated and returns the best arrangement found.",
            ],
            [
              "Periodic patterns are ambiguous",
              "If an image repeats at the cut spacing, several arrangements are equally valid for any algorithm.",
            ],
            ["Square tiles only", "Free-form contours and 3-D point clouds are future work."],
          ].map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 90} className="honest-item">
              <b>{t}</b>
              <span>{d}</span>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="finale" aria-labelledby="finale-title">
        <Reveal>
          <h2 id="finale-title" className="finale-title">
            Ready to dig in?
          </h2>
          <p className="finale-sub">Pick an artifact, run the matcher, and watch it come together.</p>
          <div className="hero-cta finale-cta">
            <button type="button" className="btn btn-primary btn-big" onClick={enter}>
              Enter the lab
            </button>
            <Link className="btn btn-big" to="/lab" onClick={markIntroSeen}>
              Go to the benchmark lab
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
