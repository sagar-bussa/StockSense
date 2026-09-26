import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { friendlyError } from '@/lib/supabase/errors'
import { useAuth } from '../AuthProvider'
import { AuthAside } from '../components/AuthAside'
import { FormAlert, SubmitButton } from '../components/FormFeedback'

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
})

type Values = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
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
      await requestPasswordReset(values.email.trim())
      setSentTo(values.email.trim())
    } catch (error) {
      setFormError(friendlyError(error, 'Could not send the reset link. Please try again.'))
    }
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <AuthAside />

      <main className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter the email address for your account and we will send a link to set a new password.
          </p>

          {sentTo ? (
            <div className="mt-7 space-y-5">
              <FormAlert variant="success">
                If an account exists for <span className="font-medium">{sentTo}</span>, a reset link is on
                its way. The link expires in one hour.
              </FormAlert>
              <Link
                to="/login"
                className="inline-flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-muted"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 space-y-4">
              {formError && <FormAlert>{formError}</FormAlert>}

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

              <SubmitButton pending={isSubmitting} pendingLabel="Sending link…">
                Send reset link
              </SubmitButton>
            </form>
          )}

          <p className="mt-7 text-center text-[13px] text-muted-foreground">
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
