"use client"

import React from 'react'
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = ({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) => (
  <CollapsiblePrimitive.CollapsibleTrigger data-collapsible-trigger="" {...props} />
)

const CollapsibleContent = ({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) => (
  <CollapsiblePrimitive.CollapsibleContent data-collapsible-content="" {...props} />
)

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
