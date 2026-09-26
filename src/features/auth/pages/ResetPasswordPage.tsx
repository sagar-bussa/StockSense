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

const schema = z
  .object({
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

export function ResetPasswordPage() {
  const { updatePassword, session, isLoading } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  /**
   * Supabase parses the recovery link's hash and establishes a session before
   * this component mounts, so the session is present on a valid link and
   * absent otherwise. Tell the user which case they are in rather than
   * failing mysteriously on submit.
   */
  const hasRecoverySession = Boolean(session)

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      await updatePassword(values.password)
      navigate('/login', { replace: true })
    } catch (error) {
      setFormError(friendlyError(error, 'Could not update your password. Please try again.'))
    }
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <AuthAside />

      <main className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>

          {!hasRecoverySession && !isLoading ? (
            <div className="mt-5 space-y-5">
              <FormAlert variant="error">
                This reset link is invalid or has expired. Request a new one to continue.
              </FormAlert>
              <Link
                to="/forgot-password"
                className="inline-flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-muted"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Choose a new password for your StockSense account.
            </p>
          )}

          {hasRecoverySession && (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 space-y-4">
              {formError && <FormAlert>{formError}</FormAlert>}

              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  aria-invalid={Boolean(errors.password)}
                  {...register('password')}
                />
                {errors.password && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
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

              <SubmitButton pending={isSubmitting} pendingLabel="Updating password…">
                Update password
              </SubmitButton>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
