// Owner: A (Arvind)
// Create-artifact wizard (modal): 1 Source → 2 Parameters → 3 Review & create.
//   sample     → POST /artifacts/sample           (JSON)
//   upload     → POST /artifacts/upload           (multipart, params as a JSON string)
//   fragments  → POST /artifacts/fragments-upload (multipart, repeated `files`; no ground truth)
// The wizard never runs matching or solving. On success it calls onCreated(artifact); the Projects page navigates
// to the gallery. On failure it stays open with the user's input intact.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  ApiError,
  createFragmentsArtifact,
  createSampleArtifact,
  createUploadArtifact,
  listSamples,
} from "../api/client";
import type { ArtifactOut } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import {
  LIMITS,
  draftFromParams,
  fieldErrorsFromApi,
  maxUploadMb,
  validateDescription,
  validateFragmentGrid,
  validateImageFile,
  validateImageFiles,
  validateName,
  validateParams,
} from "../lib/artifactForm";
import type { FieldErrors, ParamDraft } from "../lib/artifactForm";
import ErrorState from "./ErrorState";
import Loading from "./Loading";
import Modal from "./Modal";

export type SourceKind = "sample" | "upload" | "fragments";
type Step = 1 | 2 | 3;

const STEP_TITLES: Record<Step, string> = { 1: "Source", 2: "Parameters", 3: "Review and create" };
const STEP_OF_FIELD: Record<string, Step> = {
  sample: 1,
  image: 1,
  files: 1,
  rows: 2,
  cols: 2,
  rotate: 2,
  noise: 2,
  erosion: 2,
  missing: 2,
  seed: 2,
  name: 3,
  description: 3,
};

/** Object URLs for image previews, revoked when the files change or the component unmounts. */
function useObjectUrls(files: readonly File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    if (typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
      setUrls([]);
      return;
    }
    const created = files.map((f) => URL.createObjectURL(f));
    setUrls(created);
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}

interface Props {
  onClose: () => void;
  onCreated: (artifact: ArtifactOut) => void;
}

export default function ArtifactWizard({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [source, setSource] = useState<SourceKind>("sample");
  const [sample, setSample] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [fragmentFiles, setFragmentFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<ParamDraft>(draftFromParams());
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const samples = useAsync(listSamples, []);
  useEffect(() => {
    if (samples.status === "success" && !sample && samples.data.length) setSample(samples.data[0].name);
  }, [samples.status, samples.data, sample]);

  const imageList = useMemo(() => (image ? [image] : EMPTY), [image]);
  const imageUrls = useObjectUrls(imageList);
  const fragmentUrls = useObjectUrls(fragmentFiles.length ? fragmentFiles : EMPTY);

  const setField = <K extends keyof ParamDraft>(key: K, value: ParamDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // ---- step validation ------------------------------------------------------------------
  const validateStep1 = (): FieldErrors => {
    if (source === "sample") return sample ? {} : { sample: "Choose a sample." };
    if (source === "upload") {
      if (!image) return { image: "Choose an image to upload." };
      const e = validateImageFile(image);
      return e ? { image: e } : {};
    }
    if (fragmentFiles.length === 0) return { files: "Choose at least one fragment image." };
    const e = validateImageFiles(fragmentFiles);
    return e ? { files: e } : {};
  };
  const validateStep2 = (): FieldErrors =>
    source === "fragments"
      ? validateFragmentGrid(draft.rows, draft.cols, fragmentFiles.length)
      : validateParams(draft).errors;
  const validateStep3 = (): FieldErrors => {
    const out: FieldErrors = {};
    const n = validateName(name);
    if (n.error) out.name = n.error;
    const d = validateDescription(description);
    if (d) out.description = d;
    return out;
  };

  const goNext = () => {
    const e = step === 1 ? validateStep1() : validateStep2();
    // Keep messages that belong to other steps (e.g. field errors the server returned for the review step).
    setErrors((prev) => {
      const others = Object.fromEntries(Object.entries(prev).filter(([k]) => (STEP_OF_FIELD[k] ?? 3) !== step));
      return { ...others, ...e };
    });
    if (Object.values(e).some(Boolean)) return;
    setSubmitError(null);
    setStep((step + 1) as Step);
  };
  const goBack = () => {
    setSubmitError(null);
    setStep((step - 1) as Step);
  };

  // ---- submit -----------------------------------------------------------------------------
  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (inFlight.current) return; // no double submit, even before React re-renders
    const all = { ...validateStep1(), ...validateStep2(), ...validateStep3() };
    setErrors(all);
    const bad = Object.keys(all).filter((k) => all[k]);
    if (bad.length) {
      setStep(Math.min(...bad.map((k) => STEP_OF_FIELD[k] ?? 3)) as Step);
      return;
    }
    const finalName = validateName(name).name as string;
    const desc = description.trim() || undefined;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let created: ArtifactOut;
      if (source === "sample") {
        const params = validateParams(draft).params!;
        created = await createSampleArtifact({ name: finalName, sample, description: desc, fragment: params });
      } else if (source === "upload") {
        const params = validateParams(draft).params!;
        created = await createUploadArtifact({ name: finalName, image: image!, params, description: desc });
      } else {
        created = await createFragmentsArtifact({
          name: finalName,
          rows: Number(draft.rows),
          cols: Number(draft.cols),
          files: fragmentFiles,
        });
      }
      onCreated(created);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const fields = err instanceof ApiError && err.code === "validation_error" ? fieldErrorsFromApi(err.details) : {};
      if (Object.keys(fields).length) {
        setErrors(fields);
        setStep(Math.min(...Object.keys(fields).map((k) => STEP_OF_FIELD[k] ?? 3)) as Step);
      }
      setSubmitError(err);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  // ---- rendering helpers -----------------------------------------------------------------
  const field = (key: string, label: string, control: (props: FieldProps) => JSX.Element, hint?: string) => {
    const id = `wiz-${key}`;
    const err = errors[key];
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        {control({ id, "aria-invalid": err ? true : undefined, "aria-describedby": err ? `${id}-err` : undefined })}
        {hint && !err && <p className="field-hint muted">{hint}</p>}
        {err && (
          <p id={`${id}-err`} className="field-error" role="alert">
            {err}
          </p>
        )}
      </div>
    );
  };
  const numberInput = (key: "rows" | "cols" | "missing" | "seed", min?: number, max?: number) => (p: FieldProps) => (
    <input
      {...p}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft[key]}
      onChange={(e) => setField(key, e.target.value)}
    />
  );

  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    setImage(e.target.files?.[0] ?? null);
    setErrors((x) => ({ ...x, image: undefined }));
  };
  const onPickFragments = (e: ChangeEvent<HTMLInputElement>) => {
    setFragmentFiles([...(e.target.files ?? [])]);
    setErrors((x) => ({ ...x, files: undefined }));
  };

  const sourceStep = (
    <>
      <fieldset className="field">
        <legend>Where do the fragments come from?</legend>
        <div className="choice-row">
          {(
            [
              ["sample", "Sample", "A bundled artifact image, cut into fragments for you"],
              ["upload", "Upload image", "Your own picture, cut into fragments for you"],
              ["fragments", "Upload real fragments", "Photos of existing fragments (no ground truth)"],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className={source === id ? "choice active" : "choice"}>
              <input
                type="radio"
                name="source"
                value={id}
                checked={source === id}
                onChange={() => {
                  setSource(id);
                  setErrors({});
                }}
              />
              <span className="choice-label">{label}</span>
              <span className="muted choice-hint">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {source === "sample" && (
        <fieldset className="field">
          <legend>Sample</legend>
          {samples.status === "loading" && <Loading label="Loading samples…" />}
          {samples.status === "error" && <ErrorState error={samples.error} onRetry={samples.reload} />}
          {samples.status === "success" && (
            <div className="sample-grid">
              {samples.data.map((s) => (
                <label key={s.name} className={sample === s.name ? "sample active" : "sample"}>
                  <input
                    type="radio"
                    name="sample"
                    value={s.name}
                    checked={sample === s.name}
                    onChange={() => {
                      setSample(s.name);
                      setErrors((x) => ({ ...x, sample: undefined }));
                    }}
                  />
                  <img src={s.image_url} alt="" loading="lazy" />
                  <span className="choice-label">{s.name}</span>
                  <span className="muted choice-hint">{s.description}</span>
                </label>
              ))}
            </div>
          )}
          {errors.sample && (
            <p className="field-error" role="alert">
              {errors.sample}
            </p>
          )}
        </fieldset>
      )}

      {source === "upload" &&
        field(
          "image",
          "Image",
          (p) => <input {...p} type="file" accept="image/*" onChange={onPickImage} />,
          `One image, up to ${maxUploadMb()} MB.`,
        )}
      {source === "upload" && image && imageUrls[0] && (
        <img className="preview-image" src={imageUrls[0]} alt={`Preview of ${image.name}`} />
      )}

      {source === "fragments" &&
        field(
          "files",
          "Fragment images",
          (p) => <input {...p} type="file" accept="image/*" multiple onChange={onPickFragments} />,
          `One image per fragment, up to ${maxUploadMb()} MB each.`,
        )}
      {source === "fragments" && fragmentFiles.length > 0 && (
        <ul className="preview-list" aria-label="Selected fragments">
          {fragmentFiles.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {fragmentUrls[i] && <img src={fragmentUrls[i]} alt="" />}
              <span>{f.name}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const paramsStep =
    source === "fragments" ? (
      <>
        <p className="muted">
          {fragmentFiles.length} image{fragmentFiles.length === 1 ? "" : "s"} selected. Set a grid with exactly one cell
          per image.
        </p>
        <div className="field-row">
          {field("rows", "Rows", numberInput("rows", LIMITS.fragmentsGrid.min, LIMITS.fragmentsGrid.max))}
          {field("cols", "Columns", numberInput("cols", LIMITS.fragmentsGrid.min, LIMITS.fragmentsGrid.max))}
        </div>
        {errors.files && (
          <p className="field-error" role="alert">
            {errors.files}
          </p>
        )}
      </>
    ) : (
      <>
        <div className="field-row">
          {field("rows", "Rows", numberInput("rows", LIMITS.grid.min, LIMITS.grid.max))}
          {field("cols", "Columns", numberInput("cols", LIMITS.grid.min, LIMITS.grid.max))}
        </div>
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={draft.rotate} onChange={(e) => setField("rotate", e.target.checked)} />
            Rotate fragments randomly
          </label>
        </div>
        {field(
          "noise",
          `Noise (σ ${draft.noise})`,
          (p) => (
            <input
              {...p}
              type="range"
              min={LIMITS.noise.min}
              max={LIMITS.noise.max}
              step={1}
              value={draft.noise}
              onChange={(e) => setField("noise", e.target.value)}
            />
          ),
          `Gaussian pixel noise, ${LIMITS.noise.min}–${LIMITS.noise.max} (the server rejects more).`,
        )}
        {field(
          "erosion",
          `Erosion (${draft.erosion})`,
          (p) => (
            <input
              {...p}
              type="range"
              min={LIMITS.erosion.min}
              max={LIMITS.erosion.max}
              step={0.05}
              value={draft.erosion}
              onChange={(e) => setField("erosion", e.target.value)}
            />
          ),
          "Probability that each side is chipped.",
        )}
        <div className="field-row">
          {field(
            "missing",
            "Missing fragments",
            numberInput("missing", 0, LIMITS.maxMissing),
            "Must be less than rows × columns.",
          )}
          {field("seed", "Seed", numberInput("seed", LIMITS.seed.min, LIMITS.seed.max))}
        </div>
      </>
    );

  const summary: [string, string][] = [
    [
      "Source",
      source === "sample"
        ? `Sample “${sample}”`
        : source === "upload"
          ? `Image ${image?.name}`
          : `${fragmentFiles.length} fragment images`,
    ],
    ["Grid", `${draft.rows} × ${draft.cols}`],
    ...(source === "fragments"
      ? []
      : ([
          ["Rotation", draft.rotate ? "on" : "off"],
          ["Noise / erosion", `${draft.noise} / ${draft.erosion}`],
          ["Missing / seed", `${draft.missing} / ${draft.seed}`],
        ] as [string, string][])),
  ];

  const reviewStep = (
    <>
      {field("name", "Name", (p) => (
        <input
          {...p}
          type="text"
          value={name}
          maxLength={LIMITS.nameMax + 20}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => ({ ...x, name: undefined }));
          }}
        />
      ))}
      {source !== "fragments" &&
        field("description", "Description (optional)", (p) => (
          <textarea
            {...p}
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setErrors((x) => ({ ...x, description: undefined }));
            }}
          />
        ))}
      <dl className="summary">
        {summary.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );

  const hint413 =
    submitError instanceof ApiError && submitError.code === "payload_too_large"
      ? `Each image may be at most ${(submitError.details?.limit_mb as number | undefined) ?? maxUploadMb()} MB.`
      : null;
  const fieldProblems = Object.values(errors).some(Boolean);

  return (
    <Modal title="New artifact" onClose={onClose} busy={submitting} className="modal-wide">
      <form onSubmit={submit} noValidate>
        <ol className="steps" aria-label="Progress">
          {([1, 2, 3] as Step[]).map((n) => (
            <li key={n} aria-current={n === step ? "step" : undefined} className={n === step ? "active" : ""}>
              {n}. {STEP_TITLES[n]}
            </li>
          ))}
        </ol>
        <h3 className="step-title">{STEP_TITLES[step]}</h3>
        <fieldset className="wizard-body" disabled={submitting}>
          {step === 1 && sourceStep}
          {step === 2 && paramsStep}
          {step === 3 && reviewStep}
        </fieldset>

        <div role="status" aria-live="polite" className="wizard-status">
          {submitting ? "Creating artifact…" : ""}
        </div>
        {submitError && (
          <>
            {fieldProblems && submitError instanceof ApiError && submitError.code === "validation_error" ? (
              <div className="form-error" role="alert">
                <strong>{submitError.code}</strong> The server rejected some fields. See the messages next to them.
              </div>
            ) : (
              <ErrorState error={submitError} onRetry={submit} />
            )}
            {hint413 && <p className="muted">{hint413}</p>}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          {step > 1 && (
            <button type="button" className="btn" onClick={goBack} disabled={submitting}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button type="button" className="btn btn-primary" onClick={goNext}>
              Next
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

type FieldProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };
const EMPTY: File[] = [];
