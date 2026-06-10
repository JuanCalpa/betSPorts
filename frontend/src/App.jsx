import { useEffect, useState } from "react";
import { createBet, createDay, createUser, finalizeDay, loadCountries, loadDashboard, loadHistory, updateMatchResult } from "./api";

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

function emptyPredictionForm() {
  return {
    predictedHomeScore: "",
    predictedAwayScore: "",
  };
}

function emptyResultDraft() {
  return {
    homeScore: "",
    awayScore: "",
  };
}

function scoreLabel(homeScore, awayScore) {
  if (homeScore === null || awayScore === null || homeScore === undefined || awayScore === undefined) {
    return "Pendiente";
  }

  return `${homeScore} - ${awayScore}`;
}

function formatDateTime(value) {
  if (!value) {
    return "Sin horario";
  }

  return new Date(value).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString("es-ES", { dateStyle: "long" });
}

export default function App() {
  const initialDate = todayValue();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState([]);
  const [countries, setCountries] = useState([]);
  const [newUserName, setNewUserName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [matchForm, setMatchForm] = useState(emptyMatchForm(initialDate));
  const [predictionForms, setPredictionForms] = useState({});
  const [resultDrafts, setResultDrafts] = useState({});

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
      setSelectedUserId((current) => current || dashPayload.users?.[0]?.id || "");

      setPredictionForms((current) => {
        const next = { ...current };
        for (const match of dashPayload.day?.matches ?? []) {
          if (!next[match.id]) {
            next[match.id] = emptyPredictionForm();
          }
        }
        return next;
      });

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

  const selectedDay = dashboard?.day ?? null;
  const countryOptions = countries.length > 0 ? countries : dashboard?.countries ?? [];
  const users = dashboard?.users ?? [];
  const winners = dashboard?.winners ?? [];
  const matches = selectedDay?.matches ?? [];
  const pendingMatches = matches.filter((match) => match.status !== "FINISHED");
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  function countryByCode(code) {
    return countryOptions.find((country) => country.code === code) ?? null;
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedName = newUserName.trim();
    if (!trimmedName) {
      setError("Escribe el nombre del compañero antes de guardarlo.");
      return;
    }

    try {
      const payload = await createUser(trimmedName);
      setSelectedUserId(payload.user.id);
      setNewUserName("");
      setMessage("Compañero guardado.");
      await refreshDashboard(selectedDate);
    } catch (requestError) {
      setError(requestError.message);
    }
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

  async function handleSubmitPrediction(matchId) {
    setError("");
    setMessage("");

    const form = predictionForms[matchId] ?? emptyPredictionForm();

    if (!selectedUser) {
      setError("Registra y selecciona un compañero antes de apostar.");
      return;
    }

    try {
      await createBet({
        name: selectedUser.name,
        matchId,
        predictedHomeScore: Number(form.predictedHomeScore),
        predictedAwayScore: Number(form.predictedAwayScore),
      });

      setPredictionForms((current) => ({
        ...current,
        [matchId]: {
          predictedHomeScore: "",
          predictedAwayScore: "",
        },
      }));
      setMessage("Apuesta registrada.");
      await refreshDashboard(selectedDate);
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
    if (!selectedDay) {
      return;
    }

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

  const heroMatches = matches.length;
  const completedMatches = matches.filter((match) => match.status === "FINISHED").length;
  const cycleStatus = dashboard?.cycle?.status ?? "ACTIVE";

  return (
    <div className="page-shell">
      <div className="hero-backdrop" />
      <main className="app-shell">
        <section className="hero-panel glass-panel">
          <div className="hero-copy">
            <span className="eyebrow">Mundial 2026 interno</span>
            <img src="/logo.png" alt="BetSports" className="hero-logo" />
            <p>
              Crea un partido seleccionando dos países y deja que cada compañero escriba su nombre y su marcador
              directamente en la tarjeta del partido.
            </p>
            <div className="hero-metrics">
              <div>
                <strong>{cycleStatus}</strong>
                <span>Ciclo actual</span>
              </div>
              <div>
                <strong>{users.length}</strong>
                <span>Usuarios</span>
              </div>
              <div>
                <strong>{heroMatches}</strong>
                <span>Partidos en fecha</span>
              </div>
              <div>
                <strong>{completedMatches}</strong>
                <span>Resultados cargados</span>
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
        {loading ? <div className="status-banner">Cargando tablero...</div> : null}

        <section className="dashboard-grid">

          {/* Columna 1: Compañeros + Crear partido */}
          <div className="column-stack">
            <article className="glass-panel form-card">
              <div className="section-head">
                <div>
                  <span className="section-label">Compañeros</span>
                  <h2>Registrar y seleccionar</h2>
                </div>
              </div>

              <form onSubmit={handleCreateUser} className="stack-form user-form">
                <label className="field-label" htmlFor="newUserName">
                  Nombre del compañero
                </label>
                <div className="inline-actions user-actions">
                  <input
                    id="newUserName"
                    value={newUserName}
                    onChange={(event) => setNewUserName(event.target.value)}
                    placeholder="Escribe el nombre una sola vez"
                  />
                  <button type="submit" className="ghost-button">
                    Guardar compañero
                  </button>
                </div>
              </form>

              <div className="stack-form user-select-card">
                <label className="field-label" htmlFor="selectedUserId">
                  Compañero seleccionado para apostar
                </label>
                <select id="selectedUserId" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  <option value="">Selecciona un compañero</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <div className="country-preview">
                  {selectedUser ? <strong>{selectedUser.name}</strong> : <span>No hay compañero seleccionado</span>}
                </div>
              </div>
            </article>

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
                  onChange={(event) => setMatchForm((current) => ({ ...current, playDate: event.target.value }))}
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

          {/* Columna 2: Apuestas — solo partidos pendientes */}
          <div className="column-stack wide-column">
            <article className="glass-panel form-card">
              <div className="section-head">
                <div>
                  <span className="section-label">Apuestas</span>
                  <h2>Escribir nombre y marcador</h2>
                </div>
                <button type="button" className="ghost-button" onClick={handleFinalizeDay}>
                  Finalizar jornada
                </button>
              </div>

              <div className="match-list">
                {pendingMatches.length ? (
                  pendingMatches.map((match) => {
                    const predictionForm = predictionForms[match.id] ?? emptyPredictionForm();
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

                        <div className="prediction-block">
                          <h3>Pronóstico</h3>
                          <div className="stack-form compact-form">
                            <div className="score-grid compact">
                              <label className="field-stack" htmlFor={`home-prediction-${match.id}`}>
                                <span>{match.homeCountryName}</span>
                                <input
                                  id={`home-prediction-${match.id}`}
                                  type="number"
                                  min="0"
                                  value={predictionForm.predictedHomeScore}
                                  onChange={(event) =>
                                    setPredictionForms((current) => ({
                                      ...current,
                                      [match.id]: {
                                        ...predictionForm,
                                        predictedHomeScore: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Goles del primer país"
                                />
                              </label>
                              <label className="field-stack" htmlFor={`away-prediction-${match.id}`}>
                                <span>{match.awayCountryName}</span>
                                <input
                                  id={`away-prediction-${match.id}`}
                                  type="number"
                                  min="0"
                                  value={predictionForm.predictedAwayScore}
                                  onChange={(event) =>
                                    setPredictionForms((current) => ({
                                      ...current,
                                      [match.id]: {
                                        ...predictionForm,
                                        predictedAwayScore: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Goles del segundo país"
                                />
                              </label>
                            </div>
                            <button type="button" className="primary-button subtle" onClick={() => handleSubmitPrediction(match.id)}>
                              Guardar apuesta
                            </button>
                          </div>
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
                                    [match.id]: {
                                      ...resultDraft,
                                      homeScore: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Goles del primer país"
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
                                    [match.id]: {
                                      ...resultDraft,
                                      awayScore: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Goles del segundo país"
                              />
                            </label>
                          </div>
                          <button type="button" className="ghost-button" onClick={() => handleUpdateResult(match.id)}>
                            Guardar resultado
                          </button>
                        </div>

                        <div className="bets-strip">
                          {match.bets.length ? (
                            match.bets.map((bet) => (
                              <span className="bet-chip" key={bet.id}>
                                {bet.userName} {bet.predictedHomeScore}-{bet.predictedAwayScore}
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
                      ? "Todos los partidos de esta fecha ya tienen resultado. Revisa el historial."
                      : "No hay partidos creados para esta fecha."}
                  </div>
                )}
              </div>
            </article>
          </div>

          {/* Columna 3: Ranking y ganadores */}
          <div className="column-stack">
            <article className="glass-panel summary-card">
              <div className="section-head">
                <div>
                  <span className="section-label">Tabla</span>
                  <h2>Puntos y ganadores</h2>
                </div>
              </div>

              <div className="summary-grid">
                <div className="table-card">
                  <h3>Ranking actual</h3>
                  <div className="leaderboard-list">
                    {users.length ? (
                      users.map((user, index) => (
                        <div className="leaderboard-row" key={user.id}>
                          <span className="leaderboard-rank">#{index + 1}</span>
                          <div>
                            <strong>{user.name}</strong>
                            <span>{user.points} puntos</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state small">Todavía no hay usuarios.</div>
                    )}
                  </div>
                </div>

                <div className="table-card">
                  <h3>Ganadores recientes</h3>
                  <div className="winner-list">
                    {winners.length ? (
                      winners.map((winner) => (
                        <div className="winner-row" key={winner.id}>
                          <strong>{winner.userName}</strong>
                          <span>{new Date(winner.playDate).toLocaleDateString("es-ES")}</span>
                          <small>{winner.exactHits}/{winner.totalMatches} aciertos</small>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state small">Sin ganadores todavía.</div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          </div>

        </section>

        {/* Historial de partidos finalizados */}
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
                                <span
                                  key={bet.id}
                                  className={`bet-chip ${isHit ? "bet-hit" : "bet-miss"}`}
                                >
                                  {bet.userName} {bet.predictedHomeScore}-{bet.predictedAwayScore}
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
      </main>
    </div>
  );
}
