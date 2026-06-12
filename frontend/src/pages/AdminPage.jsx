import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createDay,
  deleteBet,
  finalizeDay,
  loadBackups,
  loadCountries,
  loadDashboard,
  loadHistory,
  resetStore,
  restoreBackup,
  updateMatchResult,
} from "../api";

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function emptyMatchForm(date = todayValue()) {
  return {
    playDate: date,
    homeCountryCode: "",
    awayCountryCode: "",
    scheduledAt: "",
  };
}

function emptyResultDraft() {
  return { homeScore: "", awayScore: "" };
}

function scoreLabel(homeScore, awayScore) {
  if (homeScore === null || awayScore === null || homeScore === undefined || awayScore === undefined) {
    return "Pendiente";
  }
  return `${homeScore} - ${awayScore}`;
}

function formatDateTime(value) {
  if (!value) return "Sin horario";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-ES", { dateStyle: "long" });
}

export default function AdminPage() {
  const initialDate = todayValue();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [matchForm, setMatchForm] = useState(emptyMatchForm(initialDate));
  const [resultDrafts, setResultDrafts] = useState({});
  const [backups, setBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [restoring, setRestoring] = useState(false);

  async function refreshDashboard(date = selectedDate) {
    setLoading(true);
    setError("");

    try {
      const [dashPayload, histPayload] = await Promise.all([
        loadDashboard(date),
        loadHistory(),
      ]);

      setDashboard(dashPayload);
      setHistory(histPayload.days ?? []);
      setSelectedDate(date);
      setMatchForm((current) => ({ ...current, playDate: date }));

      setResultDrafts((current) => {
        const next = { ...current };
        for (const match of dashPayload.day?.matches ?? []) {
          if (!next[match.id]) {
            next[match.id] = {
              homeScore: match.homeScore ?? "",
              awayScore: match.awayScore ?? "",
            };
          }
        }
        return next;
      });
    } catch (requestError) {
      setError(requestError.message || "No se pudo cargar el tablero.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshDashboard(initialDate);
  }, []);

  useEffect(() => {
    loadCountries()
      .then((payload) => setCountries(payload.countries ?? []))
      .catch(() => setCountries([]));
  }, []);

  useEffect(() => {
    loadBackups()
      .then((payload) => {
        setBackups(payload.backups ?? []);
        setSelectedBackup(payload.backups?.[0]?.filename ?? "");
      })
      .catch(() => setBackups([]));
  }, []);

  const selectedDay = dashboard?.day ?? null;
  const countryOptions = countries.length > 0 ? countries : dashboard?.countries ?? [];
  const matches = selectedDay?.matches ?? [];
  const pendingMatches = matches.filter((match) => match.status !== "FINISHED");
  const cycleStatus = dashboard?.cycle?.status ?? "ACTIVE";

  function countryByCode(code) {
    return countryOptions.find((c) => c.code === code) ?? null;
  }

  async function handleCreateMatch(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!matchForm.homeCountryCode || !matchForm.awayCountryCode) {
      setError("Selecciona los dos países del partido.");
      return;
    }

    if (matchForm.homeCountryCode === matchForm.awayCountryCode) {
      setError("El local y el visitante deben ser países distintos.");
      return;
    }

    try {
      await createDay({
        playDate: matchForm.playDate,
        matches: [
          {
            homeCountryCode: matchForm.homeCountryCode,
            awayCountryCode: matchForm.awayCountryCode,
            scheduledAt: matchForm.scheduledAt,
          },
        ],
      });

      setMessage("Partido creado.");
      setMatchForm(emptyMatchForm(matchForm.playDate));
      await refreshDashboard(matchForm.playDate);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleUpdateResult(matchId) {
    setError("");
    setMessage("");

    const draft = resultDrafts[matchId] ?? emptyResultDraft();

    if (draft.homeScore === "" || draft.awayScore === "") {
      setError("Completa el marcador final antes de guardarlo.");
      return;
    }

    try {
      await updateMatchResult(matchId, {
        homeScore: Number(draft.homeScore),
        awayScore: Number(draft.awayScore),
      });
      setMessage("Resultado actualizado.");
      await refreshDashboard(selectedDate);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleFinalizeDay() {
    if (!selectedDay) return;
    setError("");
    setMessage("");

    try {
      await finalizeDay(selectedDay.id);
      setMessage("Jornada revisada.");
      await refreshDashboard(selectedDate);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleReset() {
    if (!window.confirm("¿Seguro que quieres borrar TODOS los datos?\n\nSe eliminarán usuarios, partidos, apuestas y ganadores. Esta acción no se puede deshacer.")) return;
    if (!window.confirm("Segunda confirmación: ¿estás completamente seguro?")) return;

    setError("");
    setMessage("");

    try {
      await resetStore();
      setMessage("Datos reiniciados correctamente.");
      await refreshDashboard(todayValue());
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDeleteBet(betId, userName) {
    if (!window.confirm(`¿Eliminar la apuesta de ${userName}? Esta acción no se puede deshacer.`)) return;
    setError("");
    setMessage("");

    try {
      await deleteBet(betId);
      setMessage(`Apuesta de ${userName} eliminada.`);
      await refreshDashboard(selectedDate);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleRestoreBackup() {
    if (!selectedBackup) return;
    if (!window.confirm(`¿Seguro que quieres restaurar el backup del ${selectedBackup.slice(6, 16)}?\n\nEl estado actual se guardará como respaldo antes de restaurar.`)) return;

    setRestoring(true);
    setError("");
    setMessage("");

    try {
      await restoreBackup(selectedBackup);
      setMessage(`Backup del ${selectedBackup.slice(6, 16)} restaurado. Recargando datos...`);
      await refreshDashboard(selectedDate);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="hero-backdrop" />
      <main className="app-shell">
        <section className="hero-panel glass-panel">
          <div className="hero-copy">
            <span className="eyebrow">Administración — Mundial 2026 interno</span>
            <img src="/logo.png" alt="BetSports" className="hero-logo" />
            <p>
              Crea partidos, ingresa los resultados reales y gestiona los backups del sistema.
            </p>
            <div className="hero-metrics">
              <div>
                <strong>{cycleStatus}</strong>
                <span>Ciclo actual</span>
              </div>
              <div>
                <strong>{matches.length}</strong>
                <span>Partidos en fecha</span>
              </div>
              <div>
                <strong>{pendingMatches.length}</strong>
                <span>Sin resultado</span>
              </div>
            </div>
          </div>
          <div className="hero-badge">
            <span>Fecha activa</span>
            <strong>{selectedDate}</strong>
          </div>
        </section>

        {error ? <div className="status-banner error">{error}</div> : null}
        {message ? <div className="status-banner success">{message}</div> : null}
        {loading ? <div className="status-banner">Cargando...</div> : null}

        <section className="dashboard-grid">

          {/* Columna 1: Crear partido */}
          <div className="column-stack">
            <article className="glass-panel form-card">
              <div className="section-head">
                <div>
                  <span className="section-label">Partidos</span>
                  <h2>Crear partido nuevo</h2>
                </div>
              </div>

              <form onSubmit={handleCreateMatch} className="stack-form">
                <input
                  type="date"
                  value={matchForm.playDate}
                  onChange={(event) => {
                    const date = event.target.value;
                    setMatchForm((current) => ({ ...current, playDate: date }));
                    refreshDashboard(date);
                  }}
                />

                <div className="match-builder-grid">
                  <div className="country-picker">
                    <label htmlFor="homeCountryCode">País local</label>
                    <select
                      id="homeCountryCode"
                      value={matchForm.homeCountryCode}
                      onChange={(event) => setMatchForm((current) => ({ ...current, homeCountryCode: event.target.value }))}
                    >
                      <option value="">Selecciona un país</option>
                      {countryOptions.map((country) => (
                        <option value={country.code} key={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    <div className="country-preview">
                      {countryByCode(matchForm.homeCountryCode) ? (
                        <>
                          <img src={countryByCode(matchForm.homeCountryCode).flagUrl} alt={countryByCode(matchForm.homeCountryCode).name} />
                          <strong>{countryByCode(matchForm.homeCountryCode).name}</strong>
                        </>
                      ) : (
                        <span>Selecciona el local</span>
                      )}
                    </div>
                  </div>

                  <div className="country-picker">
                    <label htmlFor="awayCountryCode">País visitante</label>
                    <select
                      id="awayCountryCode"
                      value={matchForm.awayCountryCode}
                      onChange={(event) => setMatchForm((current) => ({ ...current, awayCountryCode: event.target.value }))}
                    >
                      <option value="">Selecciona un país</option>
                      {countryOptions.map((country) => (
                        <option value={country.code} key={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    <div className="country-preview">
                      {countryByCode(matchForm.awayCountryCode) ? (
                        <>
                          <img src={countryByCode(matchForm.awayCountryCode).flagUrl} alt={countryByCode(matchForm.awayCountryCode).name} />
                          <strong>{countryByCode(matchForm.awayCountryCode).name}</strong>
                        </>
                      ) : (
                        <span>Selecciona el visitante</span>
                      )}
                    </div>
                  </div>
                </div>

                <input
                  type="datetime-local"
                  value={matchForm.scheduledAt}
                  onChange={(event) => setMatchForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                />

                <button type="submit" className="primary-button">Crear partido</button>
              </form>
            </article>
          </div>

          {/* Columna 2: Resultados */}
          <div className="column-stack wide-column">
            <article className="glass-panel form-card">
              <div className="section-head">
                <div>
                  <span className="section-label">Resultados</span>
                  <h2>Ingresar resultado final</h2>
                </div>
                <button type="button" className="ghost-button" onClick={handleFinalizeDay}>
                  Finalizar jornada
                </button>
              </div>

              <div className="match-list">
                {pendingMatches.length ? (
                  pendingMatches.map((match) => {
                    const resultDraft = resultDrafts[match.id] ?? emptyResultDraft();

                    return (
                      <article className="result-card match-card" key={match.id}>
                        <div className="match-line">
                          <div className="country-line">
                            <img src={match.homeFlagUrl} alt={match.homeCountryName} />
                            <span>{match.homeCountryName}</span>
                          </div>
                          <span className="versus">vs</span>
                          <div className="country-line right">
                            <span>{match.awayCountryName}</span>
                            <img src={match.awayFlagUrl} alt={match.awayCountryName} />
                          </div>
                        </div>

                        <div className="match-meta">
                          <span>{formatDateTime(match.scheduledAt)}</span>
                          <strong>{scoreLabel(match.homeScore, match.awayScore)}</strong>
                        </div>

                        <div className="prediction-block admin-block">
                          <h3>Marcador final</h3>
                          <div className="score-grid compact">
                            <label className="field-stack" htmlFor={`home-result-${match.id}`}>
                              <span>{match.homeCountryName}</span>
                              <input
                                id={`home-result-${match.id}`}
                                type="number"
                                min="0"
                                value={resultDraft.homeScore}
                                onChange={(event) =>
                                  setResultDrafts((current) => ({
                                    ...current,
                                    [match.id]: { ...resultDraft, homeScore: event.target.value },
                                  }))
                                }
                                placeholder="Goles"
                              />
                            </label>
                            <label className="field-stack" htmlFor={`away-result-${match.id}`}>
                              <span>{match.awayCountryName}</span>
                              <input
                                id={`away-result-${match.id}`}
                                type="number"
                                min="0"
                                value={resultDraft.awayScore}
                                onChange={(event) =>
                                  setResultDrafts((current) => ({
                                    ...current,
                                    [match.id]: { ...resultDraft, awayScore: event.target.value },
                                  }))
                                }
                                placeholder="Goles"
                              />
                            </label>
                          </div>
                          <button type="button" className="ghost-button" onClick={() => handleUpdateResult(match.id)}>
                            RESULTADO FINAL
                          </button>
                        </div>

                        <div className="bets-strip">
                          {match.bets.length ? (
                            match.bets.map((bet) => (
                              <span className="bet-chip" key={bet.id}>
                                {bet.userName} {bet.predictedHomeScore}-{bet.predictedAwayScore}
                                <button
                                  type="button"
                                  className="bet-delete-btn"
                                  title="Eliminar apuesta"
                                  onClick={() => handleDeleteBet(bet.id, bet.userName)}
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="muted">Sin apuestas todavía</span>
                          )}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    {matches.length > 0
                      ? "Todos los partidos de esta fecha ya tienen resultado."
                      : "No hay partidos creados para esta fecha."}
                  </div>
                )}
              </div>
            </article>
          </div>

        </section>

        {/* Historial */}
        <section className="history-section glass-panel">
          <div className="section-head">
            <div>
              <span className="section-label">Historial</span>
              <h2>Partidos finalizados</h2>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="empty-state">No hay partidos finalizados todavía.</div>
          ) : (
            <div className="history-days">
              {history.map((day) => (
                <div className="history-day" key={day.id}>
                  <div className="history-day-header">
                    <span className="history-date">{formatDate(day.playDate)}</span>
                    {day.winners.length > 0 && (
                      <div className="history-winners-list">
                        {day.winners.map((w) => (
                          <span className="winner-badge" key={w.id}>
                            Ganador: {w.userName} — {w.exactHits}/{w.totalMatches} aciertos
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="history-matches">
                    {day.matches.map((match) => (
                      <div className="history-match" key={match.id}>
                        <div className="match-line">
                          <div className="country-line">
                            <img src={match.homeFlagUrl} alt={match.homeCountryName} />
                            <span>{match.homeCountryName}</span>
                          </div>
                          <span className="history-score">{match.homeScore} - {match.awayScore}</span>
                          <div className="country-line right">
                            <span>{match.awayCountryName}</span>
                            <img src={match.awayFlagUrl} alt={match.awayCountryName} />
                          </div>
                        </div>
                        <div className="bets-strip">
                          {match.bets.length ? (
                            match.bets.map((bet) => {
                              const isHit =
                                bet.predictedHomeScore === match.homeScore &&
                                bet.predictedAwayScore === match.awayScore;
                              return (
                                <span key={bet.id} className={`bet-chip ${isHit ? "bet-hit" : "bet-miss"}`}>
                                  {bet.userName} {bet.predictedHomeScore}-{bet.predictedAwayScore}
                                  <button
                                    type="button"
                                    className="bet-delete-btn"
                                    title="Eliminar apuesta"
                                    onClick={() => handleDeleteBet(bet.id, bet.userName)}
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })
                          ) : (
                            <span className="muted">Sin apuestas registradas</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Restaurar backup */}
        <section className="history-section glass-panel">
          <div className="section-head">
            <div>
              <span className="section-label">Recuperación</span>
              <h2>Restaurar backup</h2>
            </div>
          </div>

          {backups.length === 0 ? (
            <div className="empty-state">No hay backups disponibles todavía. Se crean automáticamente cada día a las 23:00.</div>
          ) : (
            <div className="stack-form" style={{ maxWidth: "420px" }}>
              <label className="field-label" htmlFor="backupSelect">
                Selecciona la fecha del backup
              </label>
              <select
                id="backupSelect"
                value={selectedBackup}
                onChange={(event) => setSelectedBackup(event.target.value)}
              >
                {backups.map((b) => (
                  <option key={b.filename} value={b.filename}>
                    {new Date(b.date).toLocaleDateString("es-ES", { dateStyle: "long" })}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ghost-button"
                onClick={handleRestoreBackup}
                disabled={restoring || !selectedBackup}
              >
                {restoring ? "Restaurando..." : "Restaurar este backup"}
              </button>
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                El estado actual se guardará como respaldo antes de restaurar.
              </p>
            </div>
          )}
        </section>

        {/* Reiniciar datos */}
        <section className="history-section glass-panel">
          <div className="section-head">
            <div>
              <span className="section-label">Peligro</span>
              <h2>Reiniciar todos los datos</h2>
            </div>
          </div>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
            Borra permanentemente todos los usuarios, partidos, apuestas y ganadores. Úsalo al inicio de un nuevo torneo.
          </p>
          <button type="button" className="ghost-button" style={{ borderColor: "#e53e3e", color: "#e53e3e" }} onClick={handleReset}>
            Reiniciar todos los datos
          </button>
        </section>

        <div style={{ textAlign: "center", padding: "1.5rem", opacity: 0.5, fontSize: "0.8rem" }}>
          <Link to="/">← Volver a la página principal</Link>
        </div>
      </main>
    </div>
  );
}
