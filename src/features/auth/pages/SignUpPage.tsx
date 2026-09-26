import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { friendlyError } from '@/lib/supabase/errors'
import { useAuth } from '../AuthProvider'
import { AuthAside } from '../components/AuthAside'
import { FormAlert, SubmitButton } from '../components/FormFeedback'

/** Supabase's minimum is 6; 8 is a much more honest floor for a real account. */
const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(80, 'That name is too long'),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(72, 'Passwords must be 72 characters or fewer')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type Values = z.infer<typeof schema>

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      const { needsEmailConfirmation } = await signUp(
        values.email.trim(),
        values.password,
        values.fullName.trim(),
      )
      if (needsEmailConfirmation) {
        setSentTo(values.email.trim())
        return
      }
      navigate('/', { replace: true })
    } catch (error) {
      setFormError(friendlyError(error, 'Unable to create your account. Please try again.'))
    }
  }

  if (sentTo) {
    return (
      <div className="flex min-h-dvh bg-background">
        <AuthAside />
        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <h1 className="text-xl font-semibold tracking-tight">Check your inbox</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to{' '}
              <span className="font-medium text-foreground">{sentTo}</span>. Open it to activate your
              account.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-muted"
            >
              Back to sign in
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <AuthAside />

      <main className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            New accounts start with the Warehouse Staff role. An admin can change that later.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 space-y-4">
            {formError && <FormAlert>{formError}</FormAlert>}

            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                autoComplete="name"
                placeholder="Jordan Blake"
                aria-invalid={Boolean(errors.fullName)}
                {...register('fullName')}
              />
              {errors.fullName && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : 'password-hint'}
                {...register('password')}
              />
              {errors.password ? (
                <p id="password-error" role="alert" className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              ) : (
                <p id="password-hint" className="text-xs text-muted-foreground">
                  Minimum 8 characters, with at least one letter and one number.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <SubmitButton pending={isSubmitting} pendingLabel="Creating account…">
              Create account
            </SubmitButton>
          </form>

          <p className="mt-7 text-center text-[13px] text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
