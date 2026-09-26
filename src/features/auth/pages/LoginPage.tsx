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
import { DemoAccounts } from '../components/DemoAccounts'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type Values = z.infer<typeof schema>

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      await signIn(values.email.trim(), values.password)
      // The auth-state listener owns the redirect so a refresh and a direct
      // login cannot disagree about where "signed in" lands.
      navigate('/', { replace: true })
    } catch (error) {
      setFormError(friendlyError(error, 'Unable to sign in. Check your email and password.'))
    }
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <AuthAside />

      <main className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
                <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
                  <path
                    d="M8 20.5 13 8l3.4 7.2L19 10l5 10.5H8Z"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span className="text-[15px] font-semibold tracking-tight">StockSense</span>
            </div>
          </div>

          <h1 className="text-xl font-semibold tracking-tight">Sign in to StockSense</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter your details to open your inventory dashboard.
          </p>

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
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" role="alert" className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
              {errors.password && (
                <p id="password-error" role="alert" className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <SubmitButton pending={isSubmitting} pendingLabel="Signing in…">
              Sign in
            </SubmitButton>
          </form>

          <DemoAccounts
            onPick={(email) => {
              setValue('email', email, { shouldValidate: true })
              setValue('password', 'StockSense123!', { shouldValidate: true })
            }}
          />

          <p className="mt-7 text-center text-[13px] text-muted-foreground">
            Need an account?{' '}
            <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
