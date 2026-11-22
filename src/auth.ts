import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/db";
import { ensureUser } from "@/lib/service";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Runs with `account` only on sign in. Map the Google account to our user row once.
      if (account && profile?.sub) {
        const db = await getDb();
        token.uid = await ensureUser(db, {
          sub: profile.sub,
          email: profile.email,
          name: profile.name,
        });
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
});
