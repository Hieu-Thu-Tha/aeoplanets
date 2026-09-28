import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler, Request, Response, NextFunction } from "express";
import connectPg from "connect-pg-simple";
import { rateLimit } from "express-rate-limit";
import csrf from "csurf";
import { z } from "zod";
import { storage } from "./storage";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateResetToken,
  getResetTokenExpiration,
  hashResetToken,
  verifyResetToken,
} from "./auth";
import type { User } from "@shared/schema";
import { calculateTrialEnd } from "@shared/trial";
import { configureLinkedInStrategy } from "./passport-config";
import { sendTrialLeadToLiftOS } from "./services/lift-os";
import { sendPasswordResetEmail, sendVerificationEmail, getBaseUrl } from "./services/email-service";
import { hasSuperAdminAccess, isProtectedAccountEmail } from "./privileged-accounts";

// Session configuration (reuse from Replit auth for consistency)
export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: true, // Create session for CSRF tokens even for unauthenticated users
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.REPLIT_DOMAINS?.includes('aeostars.com'),
      sameSite: "lax", // Changed from "strict" to allow OAuth redirects
      maxAge: sessionTtl,
    },
  });
}

// Rate limiting for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: "Too many authentication attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// CSRF protection middleware (session-based)
export const csrfProtection = csrf({
  cookie: false, // Use session storage instead of cookies
});

// Validation schemas
const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const resetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

declare module "express-session" {
  interface SessionData {
    superAdminViewingAs?: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
    }
    interface Request {
      accountOwnerId?: string;
      teamPermissions?: Record<string, boolean> | null;
      isSuperAdminMode?: boolean;
    }
  }
}

/**
 * Setup local authentication with passport-local strategy and LinkedIn OAuth
 */
export async function setupLocalAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure LinkedIn OAuth strategy
  configureLinkedInStrategy(storage);

  // Configure passport-local strategy
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          // Find user by email
          const user = await storage.getUserByEmail(email);
          
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }

          if (!user.passwordHash) {
            return done(null, false, { message: "Please sign in with LinkedIn" });
          }

          if (!user.isActive) {
            return done(null, false, { message: "Account is disabled" });
          }

          // Verify password
          const isValid = await verifyPassword(user.passwordHash, password);
          
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }

          // Update last login
          await storage.updateLastLogin(user.id);

          return done(null, { id: user.id });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, { id: user.id });
    } catch (error) {
      done(error);
    }
  });

  // ============= AUTHENTICATION ROUTES =============

  /**
   * GET /api/auth/linkedin
   * Initiate LinkedIn OAuth flow
   */
  app.get('/api/auth/linkedin', 
    passport.authenticate('linkedin', { 
      scope: ['openid', 'profile', 'email']
    })
  );

  /**
   * GET /api/auth/linkedin/callback
   * LinkedIn OAuth callback handler
   * Pre-launch mode: Only adam.oldfield@force24.co.uk can access the platform
   * All other users are registered for interest and redirected to thank-you
   */
  app.get('/api/auth/linkedin/callback', 
    (req: Request, res: Response, next: NextFunction) => {
      console.log('LinkedIn callback received:', {
        query: req.query,
        hasError: !!req.query.error,
        errorDescription: req.query.error_description,
      });
      
      if (req.query.error) {
        console.error('LinkedIn OAuth error:', {
          error: req.query.error,
          description: req.query.error_description,
        });
        return res.redirect(`/login?error=oauth_failed&reason=${encodeURIComponent(String(req.query.error_description || req.query.error))}`);
      }
      
      passport.authenticate('linkedin', { 
        failureRedirect: '/login?error=oauth_failed',
        failureMessage: true,
      })(req, res, next);
    },
    async (req: Request, res: Response) => {
      try {
        // Get the authenticated user
        const userId = (req.user as any)?.id;
        if (!userId) {
          return res.redirect('/login?error=auth_failed');
        }
        
        const user = await storage.getUser(userId);
        if (!user) {
          return res.redirect('/login?error=user_not_found');
        }

        // Clear any leftover super-admin "viewing as" state from a previous
        // session on this browser so each login starts in the user's own context.
        if (req.session) {
          delete req.session.superAdminViewingAs;
        }

        // Redirect authenticated user to dashboard
        res.redirect('/dashboard');
      } catch (error) {
        console.error('LinkedIn callback error:', error);
        res.redirect('/login?error=callback_failed');
      }
    }
  );

  /**
   * GET /api/auth/csrf-token
   * Get CSRF token for auth operations
   */
  app.get("/api/auth/csrf-token", csrfProtection, (req: Request, res: Response) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  /**
   * POST /api/auth/signup
   * Create account and log in
   */
  app.post("/api/auth/signup", authRateLimiter, csrfProtection, async (req: Request, res: Response) => {
    try {
      const validated = signupSchema.parse(req.body);

      // Check password strength
      const passwordCheck = validatePasswordStrength(validated.password);
      if (!passwordCheck.valid) {
        return res.status(400).json({
          message: "Password does not meet requirements",
          errors: passwordCheck.errors,
        });
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(validated.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const passwordHash = await hashPassword(validated.password);

      // Check if this is the first user (auto-promote to admin)
      const userCount = await storage.countUsers();
      const role = userCount === 0 ? "admin" : "viewer";

      const inviteToken = req.body.inviteToken as string | undefined;
      let provisionedAccount: any = null;

      if (inviteToken) {
        provisionedAccount = await storage.getProvisionedAccountByToken(inviteToken);
        if (!provisionedAccount) {
          return res.status(400).json({ message: "Invalid or expired invite token" });
        }
        if (provisionedAccount.registeredUserId) {
          return res.status(400).json({ message: "This invitation has already been used" });
        }
        if (provisionedAccount.email.toLowerCase() !== validated.email.toLowerCase()) {
          return res.status(400).json({ message: "Email does not match the invitation" });
        }
      }

      const skipVerification = !!provisionedAccount;

      const user = await storage.createUser({
        email: validated.email,
        passwordHash,
        firstName: validated.firstName,
        lastName: validated.lastName,
        role,
        emailVerified: skipVerification,
        isActive: true,
        accountType: provisionedAccount ? "admin_provisioned" : "standard",
      });

      if (!skipVerification) {
        const verifyToken = generateResetToken();
        const hashedVerifyToken = await hashResetToken(verifyToken);
        const expiresAt = getResetTokenExpiration(24);
        await storage.updateUser(user.id, {
          verificationToken: hashedVerifyToken,
          verificationTokenExpires: expiresAt,
        });

        try {
          const baseUrl = getBaseUrl();
          await sendVerificationEmail({
            to: validated.email,
            firstName: validated.firstName,
            verificationUrl: `${baseUrl}/api/auth/verify-email?token=${verifyToken}&userId=${user.id}`,
          });
        } catch (emailErr) {
          console.error("Failed to send verification email:", emailErr);
        }
      }

      if (provisionedAccount) {
        if (provisionedAccount.brandId) {
          await storage.updateBrand(provisionedAccount.brandId, { userId: user.id });

          const terms = await storage.getTrackedTermsByBrand(provisionedAccount.brandId);
          for (const term of terms) {
            await storage.updateTrackedTerm(term.id, { userId: user.id });
            const questions = await storage.getUserQuestionsByTerm(term.id);
            for (const q of questions) {
              await storage.updateUserQuestion(q.id, { userId: user.id });
            }
          }
        }

        const now = new Date();
        const trialEndsAt = calculateTrialEnd(now, provisionedAccount.trialDurationDays);
        await storage.createSubscription({
          userId: user.id,
          plan: provisionedAccount.trialPlan,
          billingInterval: "monthly",
          status: "active",
          monthlyAmount: 0,
          annualAmount: 0,
          currency: "GBP",
          billingPeriodStart: now,
          billingPeriodEnd: trialEndsAt,
          trialStartedAt: now,
          trialEndsAt,
          trialUpdatedAt: now,
          trialUpdatedBy: provisionedAccount.provisionedBy,
          cancelledAt: null,
        });

        await storage.updateProvisionedAccount(provisionedAccount.id, {
          registeredUserId: user.id,
        });
      } else {
        sendTrialLeadToLiftOS({
          firstName: validated.firstName,
          lastName: validated.lastName,
          email: validated.email,
        }).catch(() => {});
      }

      req.login({ id: user.id }, (err) => {
        if (err) {
          return res.status(500).json({ message: "Failed to log in after signup" });
        }
        res.status(201).json({
          message: "Account created successfully",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
          isProvisioned: !!provisionedAccount,
          emailVerified: user.emailVerified,
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map((e) => e.message),
        });
      }
      console.error("Signup error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  /**
   * POST /api/auth/login
   * Log in with email and password
   */
  app.post("/api/auth/login", authRateLimiter, csrfProtection, async (req: Request, res: Response, next) => {
    try {
      const validated = loginSchema.parse(req.body);

      passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
        if (err) {
          return res.status(500).json({ message: "Authentication error" });
        }

        if (!user) {
          return res.status(401).json({ message: info?.message || "Invalid credentials" });
        }

        req.login(user, async (loginErr) => {
          if (loginErr) {
            return res.status(500).json({ message: "Failed to establish session" });
          }

          // Clear any leftover super-admin "viewing as" state from a previous
          // session on this browser so each login starts in the user's own context.
          if (req.session) {
            delete req.session.superAdminViewingAs;
          }

          // Fetch full user data
          const fullUser = await storage.getUser(user.id);
          if (!fullUser) {
            return res.status(500).json({ message: "User not found" });
          }

          res.json({
            message: "Logged in successfully",
            user: {
              id: fullUser.id,
              email: fullUser.email,
              firstName: fullUser.firstName,
              lastName: fullUser.lastName,
              role: fullUser.role,
            },
            emailVerified: fullUser.emailVerified,
          });
        });
      })(req, res, next);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map((e) => e.message),
        });
      }
      res.status(500).json({ message: "Login failed" });
    }
  });

  /**
   * POST /api/auth/logout
   * Log out and destroy session
   */
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          return res.status(500).json({ message: "Failed to destroy session" });
        }
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  /**
   * POST /api/auth/forgot-password
   * Request a password reset token
   */
  app.post("/api/auth/forgot-password", authRateLimiter, csrfProtection, async (req: Request, res: Response) => {
    try {
      const validated = resetRequestSchema.parse(req.body);

      const user = await storage.getUserByEmail(validated.email);
      
      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ message: "If that email exists, a reset link has been sent" });
      }

      // Generate reset token
      const resetToken = generateResetToken();
      const hashedToken = await hashResetToken(resetToken);
      const expiresAt = getResetTokenExpiration(1); // 1 hour

      await storage.createPasswordResetToken(user.id, hashedToken, expiresAt);

      const resetUrl = `${getBaseUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`;
      try {
        await sendPasswordResetEmail({
          to: validated.email,
          firstName: user.firstName,
          resetUrl,
        });
      } catch (emailError) {
        // Keep the response indistinguishable from unknown accounts.
        console.error("Failed to send password reset email:", emailError);
      }

      res.json({ message: "If that email exists, a reset link has been sent" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map((e) => e.message),
        });
      }
      res.status(500).json({ message: "Failed to process reset request" });
    }
  });

  /**
   * POST /api/auth/reset-password
   * Reset password using token
   */
  app.post("/api/auth/reset-password", authRateLimiter, csrfProtection, async (req: Request, res: Response) => {
    try {
      const validated = resetPasswordSchema.parse(req.body);

      // Check password strength
      const passwordCheck = validatePasswordStrength(validated.password);
      if (!passwordCheck.valid) {
        return res.status(400).json({
          message: "Password does not meet requirements",
          errors: passwordCheck.errors,
        });
      }

      // Find user by reset token (verifies hash and checks expiration)
      const user = await storage.verifyAndGetUserByResetToken(validated.token);
      
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Hash new password
      const passwordHash = await hashPassword(validated.password);

      // Update password and clear reset token atomically
      await storage.updatePassword(user.id, passwordHash);
      await storage.clearPasswordResetToken(user.id);

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map((e) => e.message),
        });
      }
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  /**
   * GET /api/auth/verify-email
   * Verify email using token from email link — redirects to frontend
   */
  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token, userId } = req.query;
      if (!token || !userId || typeof token !== "string" || typeof userId !== "string") {
        return res.redirect("/verify-email?error=invalid");
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.redirect("/verify-email?error=invalid");
      }

      if (user.emailVerified) {
        return res.redirect("/dashboard");
      }

      if (!user.verificationToken || !user.verificationTokenExpires) {
        return res.redirect("/verify-email?error=invalid");
      }

      if (new Date() > new Date(user.verificationTokenExpires)) {
        return res.redirect("/verify-email?error=expired");
      }

      const isValid = await verifyResetToken(user.verificationToken, token);
      if (!isValid) {
        return res.redirect("/verify-email?error=invalid");
      }

      await storage.updateUser(userId, {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpires: null,
      });

      return res.redirect("/verify-email?verified=true");
    } catch (error) {
      console.error("Email verification error:", error);
      return res.redirect("/verify-email?error=server");
    }
  });

  const verificationResendLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1,
    message: { message: "Please wait before requesting another verification email" },
    standardHeaders: true,
  });

  /**
   * POST /api/auth/resend-verification
   * Resend the email verification link (rate-limited to 1/minute)
   */
  app.post("/api/auth/resend-verification", verificationResendLimiter, async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (user.emailVerified) {
        return res.json({ message: "Email is already verified" });
      }

      const verifyToken = generateResetToken();
      const hashedVerifyToken = await hashResetToken(verifyToken);
      const expiresAt = getResetTokenExpiration(24);

      await storage.updateUser(user.id, {
        verificationToken: hashedVerifyToken,
        verificationTokenExpires: expiresAt,
      });

      const baseUrl = getBaseUrl();
      await sendVerificationEmail({
        to: user.email!,
        firstName: user.firstName || "there",
        verificationUrl: `${baseUrl}/api/auth/verify-email?token=${verifyToken}&userId=${user.id}`,
      });

      res.json({ message: "Verification email sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to send verification email" });
    }
  });

  /**
   * GET /api/auth/verification-status
   * Check if the current user's email is verified (used by frontend polling)
   */
  app.get("/api/auth/verification-status", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json({ emailVerified: user.emailVerified });
  });
}

/**
 * Verified users from a privileged organization automatically receive the
 * "admin" role. Returns the (possibly updated) user object.
 */
async function ensurePrivilegedOrganizationAdminRole(user: User): Promise<User> {
  if (!user || user.role === "admin") return user;
  if (!user.emailVerified || !isProtectedAccountEmail(user.email)) return user;
  try {
    await storage.updateUser(user.id, { role: "admin" });
    return { ...user, role: "admin" };
  } catch (err) {
    console.error("Failed to auto-promote privileged organization user to admin", { userId: user.id, err });
    return user;
  }
}

/**
 * Middleware to require authentication
 * Also resolves accountOwnerId and teamPermissions for team member support
 */
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    let user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!user.isActive) {
      req.logout(() => {});
      return res.status(403).json({ message: "Account is deactivated" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ message: "Email not verified", code: "EMAIL_NOT_VERIFIED" });
    }

    // Auto-promote verified privileged-organization staff to admin role.
    user = await ensurePrivilegedOrganizationAdminRole(user);

    const teamMember = await storage.getTeamMemberByUserId(req.user.id);
    if (teamMember) {
      req.accountOwnerId = teamMember.accountOwnerId;
      req.teamPermissions = teamMember.permissions as Record<string, boolean>;
    } else {
      req.accountOwnerId = req.user.id;
      req.teamPermissions = null;
    }

    const viewingAs = req.session?.superAdminViewingAs;
    if (viewingAs && viewingAs !== req.user.id) {
      if (hasSuperAdminAccess(user)) {
        req.accountOwnerId = viewingAs;
        req.teamPermissions = null;
        req.isSuperAdminMode = true;
      } else {
        delete req.session.superAdminViewingAs;
      }
    }
    
    next();
  } catch (error) {
    res.status(500).json({ message: "Authorization check failed" });
  }
};

/**
 * Middleware to require admin role
 */
export const isAdmin: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    if (user.role === "admin") return next();
    if (hasSuperAdminAccess(user)) return next();
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  } catch (error) {
    res.status(500).json({ message: "Authorization check failed" });
  }
};

/**
 * Helper function to get user ID from request
 */
export function getUserId(req: Request): string {
  if (!req.user) {
    throw new Error("User not authenticated");
  }
  return req.user.id;
}

/**
 * Get the account owner ID (for team members, returns their owner's ID)
 */
export function getAccountOwnerId(req: Request): string {
  return req.accountOwnerId || req.user!.id;
}

/**
 * Check if user has a specific permission
 * Account owners always have full access (teamPermissions === null)
 */
export function hasPermission(req: Request, permission: string): boolean {
  if (req.teamPermissions === null || req.teamPermissions === undefined) {
    return true;
  }
  return !!req.teamPermissions[permission];
}

/**
 * Check if the current user is the account owner (not a team member)
 */
export function isAccountOwner(req: Request): boolean {
  return req.teamPermissions === null || req.teamPermissions === undefined;
}
