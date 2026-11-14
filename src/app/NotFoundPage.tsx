import { ButtonLink, IsoCube, Page, Reveal } from '../ui'

export default function NotFoundPage() {
  return (
    <Page width="narrow">
      <Reveal className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
        <IsoCube size={120} ghost />
        <p className="eyebrow mt-7">Page not found</p>
        <h1 className="mt-2 text-3xl text-ink md:text-4xl">This piece isn’t part of the cube</h1>
        <p className="mt-2 max-w-sm text-lg text-ink-muted">The page you were looking for doesn’t exist. Let’s get you back to something that does.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/" iconLeft="home">
            Go home
          </ButtonLink>
          <ButtonLink to="/learn" variant="secondary" iconLeft="route">
            Open the path
          </ButtonLink>
        </div>
      </Reveal>
    </Page>
  )
}
