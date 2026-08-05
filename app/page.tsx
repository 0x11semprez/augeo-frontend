"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";

type Prestation = { Code: string; Libelle: string; PrixTTC: number };
type Operateur = { nom: string; email: string; telephone: string };
type FormData = {
  civilite: string;
  nom: string;
  nomJeuneFille: string;
  prenom: string;
  dateNaissance: string;
  dateDeces: string;
  heureDeces: string;
  villeDeces: string;
  codePostal: string;
  tailleDefunt: string;
  epaulement: string;
  coudeACoude: string;
  epaisseur: string;
  dateAdmission: string;
  heureAdmission: string;
  dateDepart: string;
  heureDepart: string;
  operateur: string;
};

const initialData: FormData = {
  civilite: "M",
  nom: "",
  nomJeuneFille: "",
  prenom: "",
  dateNaissance: "",
  dateDeces: "",
  heureDeces: "",
  villeDeces: "Nanterre",
  codePostal: "92000",
  tailleDefunt: "",
  epaulement: "",
  coudeACoude: "",
  epaisseur: "",
  dateAdmission: "",
  heureAdmission: "",
  dateDepart: "",
  heureDepart: "",
  operateur: "",
};
const apiUrl = process.env.NEXT_PUBLIC_DEVIS_API_URL ?? "http://localhost:8080";
const formatDate = (value: string) =>
  value ? value.split("-").reverse().join("/") : "";
const formatTime = (value: string) => (value ? value.replace(":", "h") : "");
const todayFR = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${now.getFullYear()}`;
};

export default function Home() {
  const [data, setData] = useState<FormData>(initialData);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [villeSuggestions, setVilleSuggestions] = useState<string[]>([]);
  const [selectedPrestations, setSelectedPrestations] = useState<
    Record<string, boolean>
  >({});
  const [isLoadingPrestations, setIsLoadingPrestations] = useState(true);
  const [status, setStatus] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadPrestations() {
      try {
        const response = await fetch(`${apiUrl}/api/prestations`);
        if (!response.ok) throw new Error();
        setPrestations(await response.json());
      } catch {
        setStatus({
          type: "error",
          message:
            "Impossible de charger les prestations. Vérifiez que l’API est démarrée.",
        });
      } finally {
        setIsLoadingPrestations(false);
      }
    }
    loadPrestations();
  }, []);
  useEffect(() => {
    async function loadOperateurs() {
      try {
        const response = await fetch(`${apiUrl}/api/operateurs`);
        if (!response.ok) throw new Error();
        setOperateurs(await response.json());
      } catch {
        // Non-blocking: the field stays usable as free text if the list fails to load.
      }
    }
    loadOperateurs();
  }, []);
  useEffect(() => {
    const codePostal = data.codePostal;
    let cancelled = false;
    async function loadVilles() {
      if (!/^\d{5}$/.test(codePostal)) {
        if (!cancelled) setVilleSuggestions([]);
        return;
      }
      try {
        const response = await fetch(
          `${apiUrl}/api/villes?codePostal=${codePostal}`,
        );
        const villes: string[] = response.ok ? await response.json() : [];
        if (cancelled) return;
        setVilleSuggestions(villes);
        if (villes.length === 1) {
          setData((current) => ({ ...current, villeDeces: villes[0] }));
        }
      } catch {
        if (!cancelled) setVilleSuggestions([]);
      }
    }
    loadVilles();
    return () => {
      cancelled = true;
    };
  }, [data.codePostal]);
  const updateField = (field: keyof FormData, value: string) =>
    setData((current) => {
      const next = { ...current, [field]: value };
      if (
        (field === "dateAdmission" || field === "heureAdmission") &&
        next.dateAdmission &&
        next.dateDepart &&
        next.dateDepart < next.dateAdmission
      )
        next.dateDepart = next.dateAdmission;
      if (
        next.dateAdmission === next.dateDepart &&
        next.heureAdmission &&
        next.heureDepart &&
        next.heureDepart < next.heureAdmission
      )
        next.heureDepart = next.heureAdmission;
      return next;
    });
  const togglePrestation = (code: string) =>
    setSelectedPrestations((current) => ({
      ...current,
      [code]: !current[code],
    }));
  const departureTimeMin =
    data.dateAdmission && data.dateAdmission === data.dateDepart
      ? data.heureAdmission
      : undefined;
  const buildDevisLabel = () => {
    const nomPrenom = [data.nom, data.prenom].filter(Boolean).join(", ");
    const depart = data.dateDepart
      ? `, départ le ${formatDate(data.dateDepart)}`
      : "";
    return `Devis ${nomPrenom}${depart}`;
  };
  const normalizedOperateur = data.operateur.trim().toLowerCase();
  const selectedOperateur = operateurs.find(
    (o) => o.nom.trim().toLowerCase() === normalizedOperateur,
  );

  // mailto: instead of Outlook Web's compose deeplink, which is buggy.
  const handleOuvrirOutlook = () => {
    const subject = encodeURIComponent(buildDevisLabel());
    const body = encodeURIComponent(
      "Bonjour,\n\nVeuillez trouver le devis en pièce jointe.\n\nCordialement,",
    );
    const to = selectedOperateur?.email ?? "";
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    setStatus({
      type: "success",
      message: selectedOperateur?.email
        ? `Votre application mail s’est ouverte avec un nouveau message adressé à ${selectedOperateur.email}.`
        : "Votre application mail s’est ouverte avec un nouveau message. Sélectionnez une pompe funèbre pour pré-remplir le destinataire.",
    });
  };

  // Generates the devis PDF and opens it in a new window.
  async function generateDevis(): Promise<boolean> {
    const selected = Object.fromEntries(
      Object.entries(selectedPrestations)
        .filter(([, isSelected]) => isSelected)
        .map(([code]) => [code, 1]),
    );
    if (!data.nom.trim() || !data.prenom.trim()) {
      setStatus({
        type: "error",
        message: "Renseignez au minimum le nom et le prénom du défunt.",
      });
      return false;
    }
    if (
      data.dateAdmission &&
      data.dateDepart &&
      data.dateDepart < data.dateAdmission
    ) {
      setStatus({
        type: "error",
        message:
          "La date de départ ne peut pas être antérieure à la date d’admission.",
      });
      return false;
    }
    if (
      data.dateAdmission === data.dateDepart &&
      data.heureAdmission &&
      data.heureDepart &&
      data.heureDepart < data.heureAdmission
    ) {
      setStatus({
        type: "error",
        message:
          "L’heure de départ ne peut pas être antérieure à l’heure d’admission.",
      });
      return false;
    }
    if (!Object.keys(selected).length) {
      setStatus({
        type: "error",
        message: "Sélectionnez au moins une prestation.",
      });
      return false;
    }
    setIsSubmitting(true);
    setStatus(null);
    // Open before the `await` so it isn't blocked as a pop-up.
    const pdfWindow = window.open("", "_blank");
    try {
      const response = await fetch(`${apiUrl}/api/devis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          dateCommande: todayFR(),
          dateNaissance: formatDate(data.dateNaissance),
          dateDeces: formatDate(data.dateDeces),
          heureDeces: formatTime(data.heureDeces),
          dateAdmission: formatDate(data.dateAdmission),
          heureAdmission: formatTime(data.heureAdmission),
          dateDepart: formatDate(data.dateDepart),
          heureDepart: formatTime(data.heureDepart),
          prestations: selected,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "La génération du devis a échoué.");
      }
      const blob = await response.blob();
      if (pdfWindow) pdfWindow.location.href = URL.createObjectURL(blob);
      setStatus({
        type: "success",
        message: "Le devis a été généré et ouvert dans une nouvelle fenêtre.",
      });
      return true;
    } catch (error) {
      pdfWindow?.close();
      setStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Une erreur est survenue.",
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateDevis();
  }

  const selectedCount =
    Object.values(selectedPrestations).filter(Boolean).length;
  return (
    <main className="app-shell">
      <header className="site-header">
        <Image
          src="/ogf-logo-black.png"
          alt="OGF"
          width={120}
          height={62}
          priority
        />
      </header>
      <section className="workspace" id="nouveau-devis">
        <div className="content">
          <div className="page-intro">
            <div>
              <p className="eyebrow">DEVIS</p>
              <h1>Créer un nouveau devis</h1>
              <p>
                Renseignez les informations nécessaires, puis générez le
                document PDF.
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <section className="form-card">
              <Heading
                title="Informations du défunt"
                subtitle="Identité, décès et mensurations"
              />
              <div className="form-grid">
                <Field label="Civilité">
                  <select
                    value={data.civilite}
                    onChange={(e) => updateField("civilite", e.target.value)}
                  >
                    <option>M</option>
                    <option>Mme</option>
                  </select>
                </Field>
                <Field label="Nom" required>
                  <input
                    value={data.nom}
                    onChange={(e) =>
                      updateField("nom", e.target.value.toUpperCase())
                    }
                    placeholder="DUPONT"
                    required
                  />
                </Field>
                <Field label="Prénom" required>
                  <input
                    value={data.prenom}
                    onChange={(e) => updateField("prenom", e.target.value)}
                    placeholder="Jean"
                    required
                  />
                </Field>
                <Field label="Nom de jeune fille">
                  <input
                    value={data.nomJeuneFille}
                    onChange={(e) =>
                      updateField("nomJeuneFille", e.target.value)
                    }
                    placeholder="Facultatif"
                  />
                </Field>
                <Field label="Date de naissance">
                  <FrenchDateInput
                    value={data.dateNaissance}
                    onValueChange={(value) =>
                      updateField("dateNaissance", value)
                    }
                  />
                </Field>
                <Field label="Date de décès">
                  <FrenchDateInput
                    value={data.dateDeces}
                    onValueChange={(value) => updateField("dateDeces", value)}
                  />
                </Field>
                <Field label="Heure de décès">
                  <FrenchTimeInput
                    value={data.heureDeces}
                    onValueChange={(value) => updateField("heureDeces", value)}
                  />
                </Field>
                <Field label="Ville du décès">
                  <input
                    list="villes-options"
                    value={data.villeDeces}
                    onChange={(e) => updateField("villeDeces", e.target.value)}
                  />
                  <datalist id="villes-options">
                    {villeSuggestions.map((ville) => (
                      <option key={ville} value={ville} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Code postal">
                  <input
                    inputMode="numeric"
                    value={data.codePostal}
                    onChange={(e) => updateField("codePostal", e.target.value)}
                  />
                </Field>
              </div>
              <div className="subsection-label">
                Mensurations <span>Ces informations sont facultatives.</span>
              </div>
              <div className="form-grid measurement-grid">
                <Field label="Taille (cm)">
                  <input
                    inputMode="numeric"
                    value={data.tailleDefunt}
                    onChange={(e) =>
                      updateField("tailleDefunt", e.target.value)
                    }
                  />
                </Field>
                <Field label="Épaulement (cm)">
                  <input
                    inputMode="numeric"
                    value={data.epaulement}
                    onChange={(e) => updateField("epaulement", e.target.value)}
                  />
                </Field>
                <Field label="Coude à coude (cm)">
                  <input
                    inputMode="numeric"
                    value={data.coudeACoude}
                    onChange={(e) => updateField("coudeACoude", e.target.value)}
                  />
                </Field>
                <Field label="Épaisseur (cm)">
                  <input
                    inputMode="numeric"
                    value={data.epaisseur}
                    onChange={(e) => updateField("epaisseur", e.target.value)}
                  />
                </Field>
              </div>
            </section>
            <section className="form-card">
              <Heading
                title="Séjour & opérateur"
                subtitle="Dates de prise en charge et coordonnées"
              />
              <div className="form-grid">
                <Field label="Date d’admission">
                  <FrenchDateInput
                    value={data.dateAdmission}
                    onValueChange={(value) =>
                      updateField("dateAdmission", value)
                    }
                  />
                </Field>
                <Field label="Heure d’admission">
                  <FrenchTimeInput
                    value={data.heureAdmission}
                    onValueChange={(value) =>
                      updateField("heureAdmission", value)
                    }
                  />
                </Field>
                <Field label="Date de départ">
                  <FrenchDateInput
                    key={data.dateDepart}
                    value={data.dateDepart}
                    min={data.dateAdmission}
                    onValueChange={(value) => updateField("dateDepart", value)}
                  />
                </Field>
                <Field label="Heure de départ">
                  <FrenchTimeInput
                    key={data.heureDepart}
                    value={data.heureDepart}
                    min={departureTimeMin}
                    onValueChange={(value) => updateField("heureDepart", value)}
                  />
                </Field>
                <Field label="Opérateur funéraire" className="span-2">
                  <input
                    list="operateurs-options"
                    value={data.operateur}
                    onChange={(e) => updateField("operateur", e.target.value)}
                    placeholder="Pompes Funèbres Martin"
                  />
                  <datalist id="operateurs-options">
                    {operateurs.map((o, i) => (
                      <option key={i} value={o.nom} />
                    ))}
                  </datalist>
                </Field>
              </div>
            </section>
            <section className="form-card" id="prestations">
              <div className="card-heading">
                <div>
                  <h2>Prestations</h2>
                  <p>Choisissez les prestations à intégrer au devis</p>
                </div>
                <div className="selection-count">
                  {selectedCount} sélectionnée{selectedCount > 1 ? "s" : ""}
                </div>
              </div>
              {isLoadingPrestations ? (
                <div className="loading">Chargement des prestations…</div>
              ) : prestations.length ? (
                <div className="prestations-list">
                  {prestations.map((p) => (
                    <label className="prestation-row" key={p.Code}>
                      <input
                        className="prestation-checkbox"
                        type="checkbox"
                        checked={Boolean(selectedPrestations[p.Code])}
                        onChange={() => togglePrestation(p.Code)}
                        aria-label={"Sélectionner " + p.Libelle}
                      />
                      <div className="prestation-info">
                        <strong>{p.Libelle}</strong>
                        <small>{p.Code}</small>
                      </div>
                      <div className="prestation-price">
                        {p.PrixTTC.toLocaleString("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        })}{" "}
                        <span>TTC</span>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Aucune prestation disponible.</div>
              )}
            </section>
            {status && (
              <div className={`status ${status.type}`} role="status">
                {status.message}
              </div>
            )}
            <div className="submit-bar">
              <p>Le devis sera généré au format PDF.</p>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleOuvrirOutlook}
                >
                  Ouvrir Outlook
                </button>
                <button
                  className="generate-button"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Génération en cours…" : "Générer le devis"}
                  <ArrowRightIcon />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

function formatFrenchDate(value: string) {
  return value ? value.split("-").reverse().join("/") : "";
}
function parseFrenchDate(value: string) {
  const parts = value.split("/");
  if (
    parts.length !== 3 ||
    parts.some((part) => !part || !Number.isInteger(Number(part)))
  )
    return "";
  const [day, month, year] = parts;
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return "";
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? [year, month, day].join("-")
    : "";
}

// Automatically inserts "/" while typing a date (DD/MM/YYYY)
function autoFormatDateInput(rawValue: string, previousText: string) {
  const digitsOnly = rawValue.replace(/\D/g, "").slice(0, 8);
  // Detects a deletion (backspace) to avoid re-inserting the separator just removed
  const isDeleting = rawValue.length < previousText.length;
  let formatted = "";
  for (let i = 0; i < digitsOnly.length; i++) {
    if (i === 2 || i === 4) formatted += "/";
    formatted += digitsOnly[i];
  }
  if (
    isDeleting &&
    previousText.endsWith("/") &&
    formatted.length === previousText.length - 1
  ) {
    // leave as is, the user just deleted the separator
  }
  return formatted;
}

// Automatically inserts ":" while typing a time (HH:MM)
function autoFormatTimeInput(rawValue: string) {
  const digitsOnly = rawValue.replace(/\D/g, "").slice(0, 4);
  let formatted = "";
  for (let i = 0; i < digitsOnly.length; i++) {
    if (i === 2) formatted += ":";
    formatted += digitsOnly[i];
  }
  return formatted;
}

function FrenchDateInput({
  value,
  min,
  onValueChange,
}: {
  value: string;
  min?: string;
  onValueChange: (value: string) => void;
}) {
  const [text, setText] = useState(formatFrenchDate(value));

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.currentTarget.setCustomValidity("");
    const formatted = autoFormatDateInput(event.target.value, text);
    setText(formatted);
    // Validates and propagates as soon as the date is complete (DD/MM/YYYY)
    if (formatted.length === 10) {
      const parsed = parseFrenchDate(formatted);
      const isValid = Boolean(parsed && (!min || parsed >= min));
      event.currentTarget.setCustomValidity(
        isValid
          ? ""
          : min && parsed
            ? "La date de départ ne peut pas précéder l’admission."
            : "Date invalide.",
      );
      if (isValid) onValueChange(parsed);
    } else if (formatted.length === 0) {
      onValueChange("");
    }
  };

  const commit = (event: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseFrenchDate(text);
    const isValid = !text || Boolean(parsed && (!min || parsed >= min));
    event.currentTarget.setCustomValidity(
      isValid
        ? ""
        : min && parsed
          ? "La date de départ ne peut pas précéder l’admission."
          : "Utilisez le format JJ/MM/AAAA.",
    );
    if (isValid) onValueChange(parsed);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="JJ/MM/AAAA"
      maxLength={10}
      value={text}
      onChange={handleChange}
      onBlur={commit}
    />
  );
}

function FrenchTimeInput({
  value,
  min,
  onValueChange,
}: {
  value: string;
  min?: string;
  onValueChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.currentTarget.setCustomValidity("");
    const formatted = autoFormatTimeInput(event.target.value);
    setText(formatted);
    if (formatted.length === 5) {
      const [h, m] = formatted.split(":");
      const isTime = Number(h) <= 23 && Number(m) <= 59;
      const isValid = isTime && (!min || formatted >= min);
      event.currentTarget.setCustomValidity(
        isValid
          ? ""
          : min && isTime
            ? "L’heure de départ ne peut pas précéder l’admission."
            : "Heure invalide.",
      );
      if (isValid) onValueChange(formatted);
    } else if (formatted.length === 0) {
      onValueChange("");
    }
  };

  const commit = (event: React.FocusEvent<HTMLInputElement>) => {
    const parts = text.split(":");
    const isTime =
      parts.length === 2 &&
      parts[0].length === 2 &&
      parts[1].length === 2 &&
      Number(parts[0]) >= 0 &&
      Number(parts[0]) <= 23 &&
      Number(parts[1]) >= 0 &&
      Number(parts[1]) <= 59;
    const isValid = !text || Boolean(isTime && (!min || text >= min));
    event.currentTarget.setCustomValidity(
      isValid
        ? ""
        : min && isTime
          ? "L’heure de départ ne peut pas précéder l’admission."
          : "Utilisez le format HH:MM.",
    );
    if (isValid) onValueChange(text);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:MM"
      maxLength={5}
      value={text}
      onChange={handleChange}
      onBlur={commit}
    />
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="card-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>
        {label}
        {required && <b>*</b>}
      </span>
      {children}
    </label>
  );
}
