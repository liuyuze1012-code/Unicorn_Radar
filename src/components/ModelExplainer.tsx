import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ModelExplainer() {
  return (
    <Dialog>
      <DialogTrigger className="mt-6 text-lg underline underline-offset-4">How the model works</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-serif text-2xl">How the model works</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>We collected 5,819 U.S. companies that raised a first Series A between 2005 and 2013, and recorded what actually happened to each one: whether it raised a Series B or C within 3 and 5 years, and whether it raised a private round at a $1B valuation within 5 years.</p>
          <p>Only facts known at the Series A are used: industry, round size, money raised before, number of earlier rounds, time since first funding, company age, number of investors and headquarters state.</p>
          <p>Simple, transparent models learn how these facts relate to outcomes. They were checked on later years they never saw during training. Every score shows which facts pushed it up or down.</p>
          <p>The unicorn odds come with a range, because so few companies become unicorns that any single number would overstate our certainty. The same inputs always give the same result.</p>
          <p>These are historical patterns, not predictions about any one company, and not investment advice.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
