import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      if (u) {
        // Force-refresh once so we have the latest custom claims
        await u.getIdToken(true);
        try {
          let me = await api.me();

          // Permanent-admin self-heal: backend may have just promoted us; if so
          // it sets tokenRefreshNeeded so we pull a token with the fresh claim
          // before any admin route is hit.
          if (me.tokenRefreshNeeded) {
            await u.getIdToken(true);
            me = await api.me(); // re-fetch with fresh token
          }

          setPerson(me);
        } catch (err) {
          console.error('Failed to load profile', err);
          setPerson(null);
        }
      } else {
        setPerson(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        person,
        loading,
        isAdmin: !!person?.admin,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
