import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Star } from "lucide-react";
import type { CustomerReview } from "@shared/schema";
import { insertCustomerReviewSchema } from "@shared/schema";
import { format } from "date-fns";
import { z } from "zod";

export default function AdminReviewsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<CustomerReview | null>(null);
  const { toast } = useToast();

  const { data: reviews = [], isLoading } = useQuery<CustomerReview[]>({
    queryKey: ["/api/admin/reviews"],
  });

  const form = useForm<z.infer<typeof insertCustomerReviewSchema>>({
    resolver: zodResolver(insertCustomerReviewSchema),
    defaultValues: {
      name: "",
      company: "",
      position: "",
      testimonial: "",
      rating: 5,
      avatarUrl: "",
      isApproved: false,
      isFeatured: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertCustomerReviewSchema>) => {
      return apiRequest("POST", "/api/admin/reviews", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      setCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Customer review created successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create review",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<CustomerReview> }) => {
      return apiRequest("PATCH", `/api/admin/reviews/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      toast({
        title: "Success",
        description: "Review updated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update review",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/reviews/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      setDeleteDialogOpen(false);
      setSelectedReview(null);
      toast({
        title: "Success",
        description: "Review deleted successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete review",
      });
    },
  });

  const handleToggleApproval = (review: CustomerReview) => {
    updateMutation.mutate({
      id: review.id,
      updates: { isApproved: !review.isApproved },
    });
  };

  const handleToggleFeatured = (review: CustomerReview) => {
    updateMutation.mutate({
      id: review.id,
      updates: { isFeatured: !review.isFeatured },
    });
  };

  const handleDelete = () => {
    if (selectedReview) {
      deleteMutation.mutate(selectedReview.id);
    }
  };

  const onSubmit = (data: z.infer<typeof insertCustomerReviewSchema>) => {
    createMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle data-testid="text-page-title">Customer Reviews Management</CardTitle>
            <CardDescription>Manage customer testimonials and reviews for the landing page</CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-review">
                <Plus className="h-4 w-4 mr-2" />
                Add Review
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Add Customer Review</DialogTitle>
                <DialogDescription>
                  Create a new customer testimonial with star rating and company information.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input data-testid="input-customer-name" placeholder="John Smith" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Input data-testid="input-company" placeholder="Acme Corp" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-position"
                            placeholder="CEO"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="testimonial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Testimonial</FormLabel>
                        <FormControl>
                          <Textarea
                            data-testid="input-testimonial"
                            placeholder="AEOSTARS transformed how our brand appears in AI search results..."
                            rows={4}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rating"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rating (1-5 stars)</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-rating"
                            type="number"
                            min={1}
                            max={5}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="avatarUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Avatar URL (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-avatar-url"
                            placeholder="https://..."
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setCreateDialogOpen(false)}
                      disabled={createMutation.isPending}
                      data-testid="button-cancel-create"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
                      {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {createMutation.isPending ? "Creating..." : "Create Review"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No reviews yet. Add your first customer testimonial!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Testimonial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.map((review) => (
                    <TableRow key={review.id} data-testid={`row-review-${review.id}`}>
                      <TableCell className="font-medium">
                        <div data-testid={`text-review-name-${review.id}`}>{review.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {review.company}
                          {review.position && ` · ${review.position}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < review.rating ? "fill-yellow-500 text-yellow-500" : "text-muted"
                              }`}
                            />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="truncate text-sm">{review.testimonial}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {review.isApproved ? (
                            <Badge variant="default" data-testid={`badge-approved-${review.id}`}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="secondary" data-testid={`badge-approved-${review.id}`}>
                              <XCircle className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                          {review.isFeatured && (
                            <Badge variant="outline" data-testid={`badge-featured-${review.id}`}>
                              Featured
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {review.createdAt ? format(new Date(review.createdAt), "MMM d, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant={review.isApproved ? "outline" : "default"}
                            onClick={() => handleToggleApproval(review)}
                            disabled={updateMutation.isPending}
                            data-testid={`button-approve-${review.id}`}
                          >
                            {review.isApproved ? "Unapprove" : "Approve"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleFeatured(review)}
                            disabled={updateMutation.isPending}
                            data-testid={`button-feature-${review.id}`}
                          >
                            {review.isFeatured ? "Unfeature" : "Feature"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedReview(review);
                              setDeleteDialogOpen(true);
                            }}
                            data-testid={`button-delete-${review.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Review</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the review from {selectedReview?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover-elevate"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
