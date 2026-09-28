import passport from "passport";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import type { IStorage } from "./storage";
import type { User } from "@shared/schema";
import { sendTrialLeadToLiftOS } from "./services/lift-os";

/**
 * Configure LinkedIn OAuth 2.0 strategy
 */
export function configureLinkedInStrategy(storage: IStorage) {
  const callbackURL = process.env.LINKEDIN_CALLBACK_URL || 'https://aeostars.com/api/auth/linkedin/callback';

  console.log(`LinkedIn OAuth callback URL: ${callbackURL}`);

  if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
    console.warn('LinkedIn OAuth credentials not configured. LinkedIn authentication will not work.');
    return;
  }

  passport.use('linkedin', 
    new OAuth2Strategy(
      {
        authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
        clientID: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL,
        scope: ['openid', 'profile', 'email'], // IMPORTANT: Include openid for OpenID Connect
        state: true, // CSRF protection
      },
      async (accessToken: string, refreshToken: string, params: any, profile: any, done: (error: any, user?: any) => void) => {
        try {
          // Fetch user info from LinkedIn OpenID Connect endpoint
          const response = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`LinkedIn API error: ${response.status} ${response.statusText}`, errorText);
            return done(new Error(`LinkedIn API error: ${response.statusText}`));
          }

          const userInfo = await response.json();
          console.log('LinkedIn userInfo received:', { sub: userInfo.sub, email: userInfo.email, hasEmail: !!userInfo.email });
          // Response: { sub, name, given_name, family_name, picture, email, email_verified }
          
          const linkedinId = userInfo.sub;
          const email = userInfo.email;
          const firstName = userInfo.given_name;
          const lastName = userInfo.family_name;
          const profilePictureUrl = userInfo.picture;

          if (!email) {
            console.error('LinkedIn OAuth error: No email in userInfo response', userInfo);
            return done(new Error('No email provided by LinkedIn. Please ensure email scope is granted.'));
          }

          // 1. Try to find by LinkedIn ID (returning user)
          let user = await storage.getUserByLinkedInId(linkedinId);
          if (user) {
            if (!user.isActive) {
              return done(null, false, { message: "Account is deactivated" });
            }
            // Update last login
            await storage.updateLastLogin(user.id);
            return done(null, user);
          }

          // 2. Try to find by email (link accounts)
          user = await storage.getUserByEmail(email);
          if (user) {
            if (!user.isActive) {
              return done(null, false, { message: "Account is deactivated" });
            }
            // Link LinkedIn to existing account
            const updatedUser = await storage.updateUser(user.id, {
              linkedinId,
              profileImageUrl: profilePictureUrl,
              authProvider: 'linkedin',
              emailVerified: true,
              verificationToken: null,
              verificationTokenExpires: null,
              firstName: firstName || user.firstName,
              lastName: lastName || user.lastName,
            });
            await storage.updateLastLogin(updatedUser.id);
            return done(null, updatedUser);
          }

          // 3. Create new user
          const newUser = await storage.createUser({
            email,
            passwordHash: null, // OAuth users have no password
            firstName,
            lastName,
            linkedinId,
            profileImageUrl: profilePictureUrl,
            authProvider: 'linkedin',
            role: 'viewer', // Default role
            isActive: true,
            emailVerified: true, // LinkedIn emails are verified
          });
          
          await storage.updateLastLogin(newUser.id);

          sendTrialLeadToLiftOS({
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            email: newUser.email,
          }).catch(() => {});

          return done(null, newUser);
        } catch (error) {
          console.error('LinkedIn OAuth error (detailed):', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          return done(error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}
