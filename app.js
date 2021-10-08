'use strict';

const { useState, useContext, createContext, useEffect, Fragment } = React;

const MAGIC_PUBLIC_KEY = "pk_live_90589CD0D4A79D9F";
const STRAPI = `http://localhost:1337`;

const AuthContext = createContext()

const obtenerSesion = () => {
  if (typeof(Storage) !== undefined) {
    return {
      data: JSON.parse(localStorage.getItem("data"))
    }
  }
  return {}
}
const guardarSesion = email => {
  if (typeof(Storage) !== undefined) {
    const data = JSON.parse(localStorage.getItem("data"))
    localStorage.setItem("data", JSON.stringify({
      ...data,
      email
    }))
  }
}
const limpiarSesion = () => {
  if (typeof(Storage) !== undefined) {
    localStorage.removeItem("data")
  }
}

const obtenerToken = () => {
  if (typeof(Storage) !== undefined) {
    return {
      data: JSON.parse(sessionStorage.getItem("data"))
    }
  }
  return {}
}
const guardarToken = token => {
  if (typeof(Storage) !== undefined) {
    sessionStorage.setItem("data", JSON.stringify({
      token,
      createdAt: Date.now()
    }))
  }
}
const limpiarToken = () => {
  if (typeof(Storage) !== undefined) {
    sessionStorage.removeItem("data")
  }
}

let magic
const AuthProvider = props => {

  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const [loadingToken, setLoadingToken] = useState(false)

  const loginUser = async email => {
    try {
      await magic.auth.loginWithMagicLink({ email })
      setUser({ email })
      console.log("Iniciaste como " + email)
      guardarSesion(email)
      loadToken()
    } catch (err) {
      setUser(null)
    }
  }

  const logoutUser = async () => {
    try {
      await magic.user.logout()
      limpiarToken()
      limpiarSesion()
      console.log("Cerraste sesión")
      setToken(null)
      setUser(null)
    } catch (err) {}
  }

  const checkIsLoggedIn = async () => {
    const { data: sesionData } = obtenerSesion()
    let sesionRecuperada = false
    if (sesionData) {
      const { email } = sesionData
      setUser({ email })
      sesionRecuperada = true
    }
    let tokenRecuperado = false
    const { data: tokenData } = obtenerToken()
    if (tokenData) {
      const { token, createdAt } = tokenData
      const diferenciaMs = Date.now() - createdAt
      const diferenciaHoras = Math.floor(diferenciaMs/1000/60/60)
      if (diferenciaHoras > 24) {
        // Elimina el token.
        limpiarToken()
      } else {
        // Guarda el token en el contexto
        tokenRecuperado = true
        setToken(token)
      }
    }
    try {
      console.log("Verificando sesión")
      const isLoggedIn = await magic.user.isLoggedIn()

      if (isLoggedIn) {
        console.log("Sesion activa")
        // Carga la sesion de usuario si no ha sido recuperada del localStorage.
        if (!sesionRecuperada) {
          await loadSession()
        }
        if (!tokenRecuperado) {
          await loadToken()
        }
      } else {
        console.log("Inicia para actualizar tu actividad social")
        limpiarSesion()
        limpiarToken()
        setUser(null)
        setToken(null)
      }
    } catch (err) {
      console.log(err)
      console.log("Tu información no pudo ser cargada")
    }
    setLoadingUser(false)
  }

  const loadSession = async () => {
    setLoadingUser(true)
    console.log("Recuperando sesión")
    const { email } = await magic.user.getMetadata()
    console.log("Iniciaste como " + email)
    setUser({ email })
    setLoadingUser(false)
    guardarSesion(email)
  }
  const loadToken = async () => {
    setLoadingToken(true)
    const newToken = await getToken()
    setToken(newToken)
    setLoadingToken(false)
    guardarToken(newToken)
  }

  const getToken = async () => {
    try {
      console.log("Obteniendo token de acceso")
      const newToken = await magic.user.getIdToken({ lifespan: 86400 /*24h*/ })
      console.log("Token obtenida")
      return newToken
    } catch (err) {
      console.log(err)
      console.log("El token no pudo ser obtenido")
    }
    return null
  }

  useEffect(() => {
    magic = new Magic(MAGIC_PUBLIC_KEY)
    checkIsLoggedIn()
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loadingUser, loginUser, logoutUser, loadingToken,loadToken }}>
      {props.children}
    </AuthContext.Provider>
  )
}

/**
* This hook loads the activity of the given user if it's a regular one
* or the activities of all the users if it's an admin.
* It returns the activities, along with the role of the user
* and a boolean indicating whether the data is loading.
*/
const useActivities = () => {
  const { token, loadingToken } = useContext(AuthContext)

  const [_data, setData] = useState({})
  const [loading, setLoading] = useState(true)

  const loadActivities = async (token) => {
    setLoading(true)
    const url = `${STRAPI}/actividad-usuarios`
    const dataRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    const data = await dataRes.json()
    setData(data)
    setLoading(false)
  }

  useEffect(() => {
    if (loadingToken) {
      setLoading(true)
      return
    }
    if (token) {
      loadActivities(token)
    }
  }, [token, loadingToken])

  return {
    activities: _data.activities,
    role: _data.role,
    loadingActivities: loading
  }
}

function Home() {

  const {
    user,
    token,
    loadingUser,
    logoutUser,
    loadingToken
  } = useContext(AuthContext)

  const {
    activities,
    role,
    loadingActivities
  } = useActivities()

  return (
    <div className="appContainer">
      <main>
        {
          !user ?
            !loadingUser ?
              <LoginForm />
            : <p>Cargando información de usuario</p>
          : (
            <Fragment>
              <h1>{user.email}</h1>
              <button onClick={logoutUser}>logout</button>
              {
                loadingActivities ?
                  <p>Cargando información</p>
                : (
                  <Fragment>
                    {
                      (role === "cta") ?
                        <DashboardAdmin activities={activities} />
                      : <DashboardUser activities={activities} />
                    }
                  </Fragment>
                )
              }
            </Fragment>
          )
        }
      </main>
    </div>
  )
}

const DashboardAdmin = ({activities}) => {
  const activitiesList = activities.map(a => (
    <AdminViewActivity key={a.id} data={a} />
  ))
  return (
    <Fragment>
      <h2>Panel de administrador</h2>
      {activitiesList}
    </Fragment>
  )
}
const DashboardUser = ({activities}) => {
  const activitiesList = activities ? activities.map(a => (
    <Activity key={a.id} data={a} />
  )) : []
  const { token } = useContext(AuthContext)

  const [plataforma, setPlataforma] = useState("default")
  const [link, setLink] = useState("")

  const handlePlataforma = e => {
    setPlataforma(e.target.value)
  }
  const handleLink = e => {
    setLink(e.target.value)
  }
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!link || !link.trim()) {
      console.log("Introduce un link")
      return
    }
    if (plataforma === "default") {
      console.log("Selecciona una plataforma")
      return
    }
    const url = `${STRAPI}/actividad-usuarios`
    try {
      await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "POST",
        body: JSON.stringify({
          link,
          plataforma
        })
      })
      console.log("Tu actividad ha sido enviada")
    } catch(err) {
      console.log("Tu actividad no ha sido enviada")
    }
  }
  return (
    <Fragment>
      <h3>Sube tu actividad social</h3>
      <form onSubmit={handleSubmit}>
        <label>
          Plataforma
          <select value={plataforma} onChange={handlePlataforma}>
            <option value="default">Seleccionar</option>
            <option value="twitter">Twitter</option>
            <option value="instagram">Instagram</option>
          </select>
        </label>
        <label>
          Enlace
          <input type="text" onChange={handleLink} value={link} required />
        </label>
        <button type="submit">Enviar</button>
      </form>
      {
        (activitiesList.length > 0) &&
        <Fragment>
          <h2>Tu actividad social en ADAXA</h2>
          {activitiesList}
        </Fragment>
      }
    </Fragment>
  )
}

const Activity = ({data}) => {
  return (
    <div>
      <p>Fecha: {(new Date(data.published_at)).toLocaleDateString()}</p>
      <div>plataforma: {data.plataforma}</div>
      <div>enlace: {data.link}</div>
      {
        data.aprobado ?
          <Fragment>
            <p>Aprobado</p>
            <p>Puntuación: {data.puntuacion}</p>
          </Fragment>
        : data.rechazado ?
            <p>Rechazado</p>
          : <p>Este contenido aún no ha sido aprobado</p>
      }
    </div>
  )
}

const AdminViewActivity = ({data}) => {
  const { token } = useContext(AuthContext)

  const [punt, setPunt] = useState(data.puntuacion || 0)
  const handleAprobar = () => {
    if (!(punt > 0)) {
      console.log("Coloca una puntuación")
      return
    }
    const url = `${STRAPI}/actividad-usuarios/${data.id}/aprobar`
    fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: punt
    })
  }

  const handleRechazar = () => {
    const url = `${STRAPI}/actividad-usuarios/${data.id}/rechazar`
    fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
  }
  return (
    <div>
      <h4>usuario: {data.user.email}</h4>
      <p>Fecha: {(new Date(data.published_at)).toLocaleDateString()}</p>
      <div>plataforma: {data.plataforma}</div>
      <div>enlace: {data.link}</div>
      <label>
        Puntuación
        <input type="number" value={punt} onChange={e => setPunt(e.target.value)} />
      </label>
      {
        data.aprobado ?
          <p>Aprobado</p>
        : <button onClick={handleAprobar}>Aprobar</button>
      }
      {
        data.rechazado ?
          <p>Rechazado</p>
        : <button onClick={handleRechazar}>Rechazar</button>
      }
    </div>
  )
}

const LoginForm = () => {
  const { loginUser } = useContext(AuthContext)

  const [email, setEmail] = useState("")
  const [disabled, setDisabled] = useState("")

  const handleInput = e => {
    setEmail(e.target.value)
  }
  const handleSubmit = async e => {
    e.preventDefault()
    setDisabled("disabled")
    await loginUser(email)
    setDisabled("")
  }
  return (
    <form className="d-flex flex-column" onSubmit={handleSubmit}>
      <label htmlFor="correo" className="form-label mt-2">correo:</label>
      <input
        type="email"
        id="correo"
        placeholder="tu dirección de correo"
        value={email}
        onChange={handleInput}
        className="mb-3 form-control"
      />
      <button type="submit" className={disabled.concat(" btn btn-primary")}>
        { disabled ? "Espera" : "Ingresar" }
      </button>
    </form>
  )
}

function MyApp() {
  return (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );
}

const domContainer = document.querySelector('#app');
ReactDOM.render(<MyApp />, domContainer);